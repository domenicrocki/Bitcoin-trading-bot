"""Main trading engine orchestrator.

Coordinates the full analysis-to-execution cycle:
  fetch data -> compute indicators -> AI analysis -> risk check -> execute trade

Exposes ``engine`` as a module-level singleton consumed by the FastAPI router.
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from ai import get_ai_provider
from ai.prompt_builder import build_analysis_prompt
from ai.response_parser import parse_ai_response
from database import SessionLocal
from models import BotSettings, DailyPnl, EquitySnapshot, Trade
from schemas import BotStatus, Signal
from services.exchange import BinanceExchange
from services.journal import TradingJournal
from services.risk_manager import RiskManager
from services.technical_analysis import (
    compute_indicators,
    get_support_resistance,
    get_trend_direction,
)
from services.trade_executor import TradeExecutor
from services.websocket_manager import ConnectionManager

logger = logging.getLogger(__name__)

# Mapping from settings interval strings to seconds for the sleep loop
_INTERVAL_SECONDS: Dict[str, int] = {
    "15m": 15 * 60,
    "1h": 60 * 60,
}


class TradingEngine:
    """Central orchestrator that drives the bot's recurring analysis cycle.

    Holds references to every service and manages the background loop that
    runs ``run_cycle`` at the configured interval.
    """

    def __init__(self) -> None:
        # --- Services ---
        self.exchange = BinanceExchange()
        self._kraken_exchange = None  # lazy init
        self.risk_manager = RiskManager()
        self.ws_manager = ConnectionManager()
        self.journal = TradingJournal()
        self.trade_executor = TradeExecutor(
            exchange_service=self.exchange,
            risk_manager=self.risk_manager,
            ws_manager=self.ws_manager,
        )

        # --- Scheduler (optional APScheduler integration) ---
        self.scheduler: Any = None

        # --- State ---
        self.is_running: bool = False
        self.start_time: Optional[float] = None
        self.last_analysis: Optional[datetime] = None
        self._cycle_task: Optional[asyncio.Task] = None
        self._price_task: Optional[asyncio.Task] = None

    def _get_exchange(self, exchange_name: str = "binance"):
        """Return the exchange service for the given name."""
        if exchange_name == "kraken":
            if self._kraken_exchange is None:
                from services.kraken_exchange import KrakenExchange
                self._kraken_exchange = KrakenExchange()
            return self._kraken_exchange
        return self.exchange

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def uptime(self) -> Optional[float]:
        """Seconds since the engine was started, or ``None``."""
        if self.start_time is None:
            return None
        return time.time() - self.start_time

    @property
    def next_analysis(self) -> Optional[datetime]:
        """Estimated time of the next analysis cycle."""
        if self.scheduler:
            job = self.scheduler.get_job("analysis_cycle")
            if job and job.next_run_time:
                return job.next_run_time
        return None

    # ------------------------------------------------------------------
    # Scheduler helper
    # ------------------------------------------------------------------

    def set_scheduler(self, scheduler: Any) -> None:
        """Inject an APScheduler instance for cron-based scheduling."""
        self.scheduler = scheduler

    def reschedule(self, interval: str) -> None:
        """Re-register the analysis job with the APScheduler at *interval*."""
        if not self.scheduler:
            return
        try:
            self.scheduler.remove_job("analysis_cycle")
        except Exception:
            pass

        if interval == "15m":
            trigger_kwargs = {"minute": "*/15"}
        else:
            trigger_kwargs = {"minute": "0"}

        from apscheduler.triggers.cron import CronTrigger  # noqa: E402

        self.scheduler.add_job(
            self._run_cycle_wrapper,
            CronTrigger(**trigger_kwargs),
            id="analysis_cycle",
            replace_existing=True,
        )
        logger.info("Rescheduled analysis cycle to %s", interval)

    async def _run_cycle_wrapper(self) -> None:
        """APScheduler-friendly wrapper around ``run_cycle``."""
        try:
            await self.run_cycle()
        except Exception:
            logger.exception("Scheduled cycle failed")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, db: Session) -> None:
        """Mark the bot as running and persist state."""
        settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
        if settings:
            settings.is_running = True
            db.commit()

        self.is_running = True
        self.start_time = time.time()

        # Schedule initial equity snapshot (async, runs in background)
        asyncio.ensure_future(self._take_initial_snapshot())

        logger.info("Trading engine STARTED")

    async def _take_initial_snapshot(self) -> None:
        """Create an initial equity snapshot so drawdown tracking works from the start."""
        try:
            db = SessionLocal()
            settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
            exchange_name = getattr(settings, 'exchange', 'binance') or 'binance'
            active_exchange = self._get_exchange(exchange_name)
            balance = await active_exchange.get_balance()
            if balance > 0:
                snapshot = EquitySnapshot(balance=balance, equity=balance, daily_pnl=0.0)
                db.add(snapshot)
                db.commit()
                logger.info("Initial equity snapshot: %.2f USDT", balance)
            db.close()
        except Exception as exc:
            logger.warning("Failed to create initial snapshot: %s", exc)

    def stop(self, db: Optional[Session] = None) -> None:
        """Stop the engine and cancel background tasks.

        Accepts an optional ``db`` so it can be called with or without a
        database session (the router calls ``engine.stop()`` with no args).
        """
        if db is not None:
            settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
            if settings:
                settings.is_running = False
                db.commit()
        else:
            # Persist via a fresh session when no db is provided
            _db = SessionLocal()
            try:
                settings = _db.query(BotSettings).filter(BotSettings.id == 1).first()
                if settings:
                    settings.is_running = False
                    _db.commit()
            finally:
                _db.close()

        self.is_running = False
        self.start_time = None

        if self._price_task and not self._price_task.done():
            self._price_task.cancel()
        if self._cycle_task and not self._cycle_task.done():
            self._cycle_task.cancel()

        logger.info("Trading engine STOPPED")

    # ------------------------------------------------------------------
    # Main cycle
    # ------------------------------------------------------------------

    async def run_cycle(self) -> None:  # noqa: C901
        """Execute one full analysis-to-trade cycle.

        Steps
        -----
        1.  Check if bot ``is_running`` (DB flag).
        2.  Load settings from DB.
        3.  Fetch klines via exchange service (100 candles).
        4.  Compute technical indicators.
        5.  Get current balance and open positions.
        6.  Build AI prompt (via ``prompt_builder``).
        7.  Call selected AI provider.
        8.  Parse response into ``Signal``.
        9.  Log journal entry.
        10. If BUY/SELL signal with sufficient confidence:
            a. Run risk manager checks.
            b. If approved: execute trade.
            c. Broadcast signal + trade via WebSocket.
        11. Take equity snapshot.
        12. Broadcast status update.
        """
        db = SessionLocal()
        try:
            await self._run_cycle_inner(db)
        except Exception:
            logger.exception("Analysis cycle error")
            try:
                await self.ws_manager.broadcast_error("Cycle error -- see server logs")
            except Exception:
                pass
        finally:
            db.close()

    async def _run_cycle_inner(self, db: Session) -> None:  # noqa: C901
        # ---------------------------------------------------------------
        # 1. Check running state
        # ---------------------------------------------------------------
        settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
        if not settings or not settings.is_running:
            logger.debug("Bot is not running, skipping cycle")
            return

        symbol = settings.trading_pair
        interval = settings.analysis_interval
        ai_provider_name = settings.ai_provider
        exchange_name = getattr(settings, 'exchange', 'binance') or 'binance'
        active_exchange = self._get_exchange(exchange_name)

        # Update trade executor to use the active exchange
        self.trade_executor.exchange = active_exchange

        logger.info("Starting analysis cycle for %s (%s) on %s", symbol, interval, exchange_name)

        # ---------------------------------------------------------------
        # 2. Fetch market data (klines, price, balance)
        # ---------------------------------------------------------------
        try:
            df = await active_exchange.get_klines(symbol, interval, limit=100)
            current_price = await active_exchange.get_ticker_price(symbol)
            balance = await active_exchange.get_balance()
        except Exception as exc:
            logger.error("Failed to fetch market data: %s", exc)
            await self.ws_manager.broadcast_error(
                f"Market data fetch failed: {exc}"
            )
            return

        if df.empty:
            logger.warning("Empty klines DataFrame for %s", symbol)
            return

        # ---------------------------------------------------------------
        # 2b. Check fills on existing open trades
        # ---------------------------------------------------------------
        open_trades = db.query(Trade).filter(Trade.status == "OPEN").all()
        for ot in open_trades:
            try:
                await self.trade_executor.check_and_update_fills(db, ot)
            except Exception as exc:
                logger.error("Fill check failed for trade #%d: %s", ot.id, exc)

        # ---------------------------------------------------------------
        # 3. Compute technical indicators
        # ---------------------------------------------------------------
        try:
            indicators = compute_indicators(df)
            support_resistance = get_support_resistance(df)
            trend = get_trend_direction(indicators)
            indicators["trend"] = trend

            # Flatten S/R into named keys for the prompt builder
            for i, lvl in enumerate(
                support_resistance.get("support", [])[:3], start=1
            ):
                indicators[f"support_{i}"] = lvl
            for i, lvl in enumerate(
                support_resistance.get("resistance", [])[:3], start=1
            ):
                indicators[f"resistance_{i}"] = lvl
        except Exception as exc:
            logger.error("Failed to compute indicators: %s", exc)
            await self.ws_manager.broadcast_error(
                f"Indicator computation failed: {exc}"
            )
            return

        # ---------------------------------------------------------------
        # 4. Open positions and recent trades
        # ---------------------------------------------------------------
        open_trades = (
            db.query(Trade)
            .filter(Trade.status == "OPEN", Trade.symbol == symbol)
            .all()
        )
        open_positions_data = [
            {
                "side": t.side,
                "entry_price": t.entry_price,
                "quantity": t.quantity,
                "pnl": t.pnl or 0,
                "stop_loss": t.stop_loss,
            }
            for t in open_trades
        ]

        recent_trades_rows = (
            db.query(Trade)
            .filter(Trade.status == "CLOSED", Trade.symbol == symbol)
            .order_by(Trade.closed_at.desc())
            .limit(5)
            .all()
        )
        recent_trades_data = [
            {
                "side": t.side,
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "pnl": t.pnl or 0,
                "pnl_pct": t.pnl_pct or 0,
            }
            for t in recent_trades_rows
        ]

        # ---------------------------------------------------------------
        # 5. Drawdown for prompt context
        # ---------------------------------------------------------------
        drawdown_pct, _ = self.risk_manager.check_drawdown(db, settings)

        # ---------------------------------------------------------------
        # 6. Build AI prompt
        # ---------------------------------------------------------------
        prompt = build_analysis_prompt(
            symbol=symbol,
            current_price=current_price,
            indicators=indicators,
            open_positions=open_positions_data,
            recent_trades=recent_trades_data,
            balance=balance,
            drawdown_pct=drawdown_pct,
            allow_shorts=settings.allow_shorts,
        )

        # ---------------------------------------------------------------
        # 7. Call AI provider
        # ---------------------------------------------------------------
        ai_response = ""
        try:
            provider = get_ai_provider(ai_provider_name)
            ai_response = await provider.analyze(prompt)
            logger.info("AI response received from %s", ai_provider_name)
        except Exception as exc:
            logger.error("AI analysis failed: %s", exc)
            self.journal.log_analysis(
                db=db,
                symbol=symbol,
                price=current_price,
                indicators=indicators,
                ai_provider=ai_provider_name,
                prompt=prompt,
                response=str(exc),
                parsed_action="ERROR",
                confidence=0,
                risk_passed=False,
                risk_reason=f"AI error: {exc}",
            )
            await self.ws_manager.broadcast_error(f"AI analysis failed: {exc}")
            return

        # ---------------------------------------------------------------
        # 8. Parse response into Signal
        # ---------------------------------------------------------------
        signal: Optional[Signal] = parse_ai_response(ai_response, current_price)

        if signal is None:
            logger.warning("Failed to parse AI response")
            self.journal.log_analysis(
                db=db,
                symbol=symbol,
                price=current_price,
                indicators=indicators,
                ai_provider=ai_provider_name,
                prompt=prompt,
                response=ai_response,
                parsed_action="PARSE_ERROR",
                confidence=0,
                risk_passed=False,
                risk_reason="Failed to parse AI response",
            )
            return

        self.last_analysis = datetime.now(timezone.utc)

        # ---------------------------------------------------------------
        # 9. Broadcast the raw signal to all WS clients
        # ---------------------------------------------------------------
        await self.ws_manager.broadcast_signal(
            {
                "action": signal.action,
                "confidence": signal.confidence,
                "entry_price": signal.entry_price,
                "stop_loss": signal.stop_loss,
                "take_profit_1": signal.take_profit_1,
                "take_profit_2": signal.take_profit_2,
                "take_profit_3": signal.take_profit_3,
                "reasoning": signal.reasoning,
                "symbol": symbol,
                "ai_provider": ai_provider_name,
            }
        )

        # ---------------------------------------------------------------
        # 10. Risk check + trade execution (BUY / SELL only)
        # ---------------------------------------------------------------
        trade: Optional[Trade] = None
        trade_id: Optional[int] = None
        risk_passed = True
        risk_reason = ""

        if signal.action in ("BUY", "SELL"):
            # 10a. Validate signal quality (confidence, RRR, direction)
            sig_valid, sig_reason = self.risk_manager.validate_signal(
                signal, settings,
            )
            if not sig_valid:
                risk_passed = False
                risk_reason = sig_reason
            else:
                # 10b. Check position limits, drawdown, daily loss
                can_open, open_reason = self.risk_manager.can_open_position(
                    db, settings,
                )
                if not can_open:
                    risk_passed = False
                    risk_reason = open_reason
                else:
                    # 10c. Execute the trade
                    try:
                        if signal.action == "BUY":
                            trade = await self.trade_executor.execute_long(
                                db, settings, signal, balance,
                            )
                        else:
                            trade = await self.trade_executor.execute_short(
                                db, settings, signal, balance,
                            )
                        if trade:
                            trade_id = trade.id
                            logger.info(
                                "Trade executed: %s %s @ %.4f",
                                signal.action, symbol, signal.entry_price,
                            )
                    except Exception as exc:
                        logger.error("Trade execution failed: %s", exc)
                        risk_passed = False
                        risk_reason = f"Execution error: {exc}"

            # Daily loss warning (broadcast to clients)
            daily_pnl, is_warning = self.risk_manager.check_daily_loss(
                db, settings,
            )
            if is_warning:
                await self.ws_manager.broadcast_error(
                    f"WARNING: Daily loss at {daily_pnl:.2f} USDT "
                    f"({settings.daily_loss_limit_pct}% limit)"
                )
        else:
            risk_reason = "HOLD signal -- no trade"

        # Broadcast position update if a trade was opened
        if trade:
            await self.ws_manager.broadcast_position_update(
                {
                    "trade_id": trade.id,
                    "symbol": trade.symbol,
                    "side": trade.side,
                    "entry_price": trade.entry_price,
                    "quantity": trade.quantity,
                    "stop_loss": trade.stop_loss,
                    "status": trade.status,
                }
            )

        # ---------------------------------------------------------------
        # 9 (cont.) Log journal entry
        # ---------------------------------------------------------------
        self.journal.log_analysis(
            db=db,
            symbol=symbol,
            price=current_price,
            indicators=indicators,
            ai_provider=ai_provider_name,
            prompt=prompt,
            response=ai_response,
            parsed_action=signal.action,
            confidence=signal.confidence,
            risk_passed=risk_passed,
            risk_reason=risk_reason,
            trade_id=trade_id,
        )

        # ---------------------------------------------------------------
        # 11. Equity snapshot
        # ---------------------------------------------------------------
        try:
            unrealized_pnl = sum(
                (current_price - t.entry_price) * t.quantity
                if t.side == "BUY"
                else (t.entry_price - current_price) * t.quantity
                for t in open_trades
            )
            equity = balance + unrealized_pnl

            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            daily_record = (
                db.query(DailyPnl).filter(DailyPnl.date == today_str).first()
            )
            daily_pnl_val = daily_record.realized_pnl if daily_record else 0.0

            snapshot = EquitySnapshot(
                balance=balance,
                equity=equity,
                daily_pnl=daily_pnl_val,
            )
            db.add(snapshot)
            db.commit()
        except Exception:
            logger.exception("Failed to take equity snapshot")

        # ---------------------------------------------------------------
        # 12. Broadcast status
        # ---------------------------------------------------------------
        await self.ws_manager.broadcast_status(
            {
                "is_running": True,
                "last_analysis": (
                    self.last_analysis.isoformat() if self.last_analysis else None
                ),
                "symbol": symbol,
                "price": current_price,
                "signal": signal.action,
                "confidence": signal.confidence,
            }
        )

        logger.info(
            "Analysis cycle complete: %s (confidence: %d%%)",
            signal.action,
            signal.confidence,
        )

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self, db: Session) -> Dict[str, Any]:
        """Build a status dictionary for API responses and WS broadcasts."""
        settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
        open_count = db.query(Trade).filter(Trade.status == "OPEN").count()

        return {
            "is_running": self.is_running,
            "uptime_seconds": self.uptime,
            "last_analysis": self.last_analysis,
            "next_analysis": self.next_analysis,
            "active_pair": settings.trading_pair if settings else "BTCUSDT",
            "ai_provider": settings.ai_provider if settings else "openai",
            "open_positions": open_count,
        }


# ======================================================================
# Module-level singleton consumed by routers
# ======================================================================

engine = TradingEngine()
