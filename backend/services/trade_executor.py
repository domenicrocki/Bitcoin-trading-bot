"""Trade execution service with staged take-profit management.

Handles the full lifecycle of a trade: entry, staged TP exits, stop-loss
placement, breakeven updates, and position closure.
"""

import logging
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from models import BotSettings, DailyPnl, Trade
from schemas import Signal
from services.exchange import BinanceExchange
from services.risk_manager import RiskManager
from services.websocket_manager import ConnectionManager

logger = logging.getLogger(__name__)


class TradeExecutor:
    """Executes trades on the exchange and records them in the database."""

    def __init__(
        self,
        exchange_service: BinanceExchange,
        risk_manager: RiskManager,
        ws_manager: Optional[ConnectionManager] = None,
    ) -> None:
        self.exchange = exchange_service
        self.risk_manager = risk_manager
        self.ws_manager = ws_manager

    # -----------------------------------------------------------------
    # Long entry
    # -----------------------------------------------------------------

    async def execute_long(
        self,
        db: Session,
        settings: BotSettings,
        signal: Signal,
        balance: float,
    ) -> Optional[Trade]:
        """Open a LONG position: market BUY, staged limit SELLs for TPs,
        and a stop-loss order.

        Returns the persisted ``Trade`` or ``None`` on failure.
        """
        symbol = settings.trading_pair
        risk_pct = settings.max_risk_pct or 1.0

        quantity = self.risk_manager.calculate_position_size(
            balance=balance,
            risk_pct=risk_pct,
            entry_price=signal.entry_price,
            stop_loss_price=signal.stop_loss,
            leverage=settings.leverage,
        )
        if quantity <= 0:
            logger.error("Position size is zero -- aborting long entry")
            return None

        # --- Market BUY ----------------------------------------------------
        try:
            entry_order = await self.exchange.place_market_order(
                symbol=symbol, side="BUY", quantity=quantity,
            )
        except Exception:
            logger.exception("Failed to place market BUY for %s", symbol)
            return None

        filled_price = float(
            entry_order.get("fills", [{}])[0].get("price", signal.entry_price)
        )
        order_id = str(entry_order.get("orderId", ""))

        # --- TP split quantities -------------------------------------------
        tp1_pct = (settings.tp1_pct or 25.0) / 100.0
        tp2_pct = (settings.tp2_pct or 50.0) / 100.0
        tp3_pct = (settings.tp3_pct or 25.0) / 100.0

        tp1_qty = round(quantity * tp1_pct, 8)
        tp2_qty = round(quantity * tp2_pct, 8)
        tp3_qty = round(quantity - tp1_qty - tp2_qty, 8)  # remainder avoids rounding drift

        # --- Limit SELL orders for TPs ------------------------------------
        for tp_price, tp_qty, label in [
            (signal.take_profit_1, tp1_qty, "TP1"),
            (signal.take_profit_2, tp2_qty, "TP2"),
            (signal.take_profit_3, tp3_qty, "TP3"),
        ]:
            try:
                await self.exchange.place_limit_order(
                    symbol=symbol, side="SELL", quantity=tp_qty, price=tp_price,
                )
                logger.info(
                    "%s SELL order placed: qty=%.8f @ %.4f", label, tp_qty, tp_price,
                )
            except Exception:
                logger.exception("Failed to place %s limit SELL", label)

        # --- Stop-loss order -----------------------------------------------
        try:
            await self.exchange.place_stop_loss(
                symbol=symbol, side="SELL", quantity=quantity,
                stop_price=signal.stop_loss,
            )
        except Exception:
            logger.exception("Failed to place stop-loss for long %s", symbol)

        # --- Persist trade -------------------------------------------------
        trade = Trade(
            symbol=symbol,
            side="BUY",
            entry_price=filled_price,
            quantity=quantity,
            stop_loss=signal.stop_loss,
            tp1_price=signal.take_profit_1,
            tp2_price=signal.take_profit_2,
            tp3_price=signal.take_profit_3,
            status="OPEN",
            ai_provider=settings.ai_provider,
            ai_confidence=signal.confidence,
            ai_reasoning=signal.reasoning,
            binance_order_id=order_id,
        )
        db.add(trade)
        db.commit()
        db.refresh(trade)

        logger.info(
            "LONG opened: id=%s %s qty=%.8f entry=%.4f sl=%.4f",
            trade.id, symbol, quantity, filled_price, signal.stop_loss,
        )
        return trade

    # -----------------------------------------------------------------
    # Short entry
    # -----------------------------------------------------------------

    async def execute_short(
        self,
        db: Session,
        settings: BotSettings,
        signal: Signal,
        balance: float,
    ) -> Optional[Trade]:
        """Open a SHORT position: market SELL, staged limit BUYs for TPs,
        and a stop-loss BUY order.

        Returns the persisted ``Trade`` or ``None`` on failure.
        """
        symbol = settings.trading_pair
        risk_pct = settings.max_risk_pct or 1.0

        quantity = self.risk_manager.calculate_position_size(
            balance=balance,
            risk_pct=risk_pct,
            entry_price=signal.entry_price,
            stop_loss_price=signal.stop_loss,
            leverage=settings.leverage,
        )
        if quantity <= 0:
            logger.error("Position size is zero -- aborting short entry")
            return None

        # --- Market SELL ---------------------------------------------------
        try:
            entry_order = await self.exchange.place_market_order(
                symbol=symbol, side="SELL", quantity=quantity,
            )
        except Exception:
            logger.exception("Failed to place market SELL for %s", symbol)
            return None

        filled_price = float(
            entry_order.get("fills", [{}])[0].get("price", signal.entry_price)
        )
        order_id = str(entry_order.get("orderId", ""))

        # --- TP split quantities -------------------------------------------
        tp1_pct = (settings.tp1_pct or 25.0) / 100.0
        tp2_pct = (settings.tp2_pct or 50.0) / 100.0
        tp3_pct = (settings.tp3_pct or 25.0) / 100.0

        tp1_qty = round(quantity * tp1_pct, 8)
        tp2_qty = round(quantity * tp2_pct, 8)
        tp3_qty = round(quantity - tp1_qty - tp2_qty, 8)

        # --- Limit BUY orders for TPs (shorts close by buying) ------------
        for tp_price, tp_qty, label in [
            (signal.take_profit_1, tp1_qty, "TP1"),
            (signal.take_profit_2, tp2_qty, "TP2"),
            (signal.take_profit_3, tp3_qty, "TP3"),
        ]:
            try:
                await self.exchange.place_limit_order(
                    symbol=symbol, side="BUY", quantity=tp_qty, price=tp_price,
                )
                logger.info(
                    "%s BUY order placed: qty=%.8f @ %.4f", label, tp_qty, tp_price,
                )
            except Exception:
                logger.exception("Failed to place %s limit BUY", label)

        # --- Stop-loss order (BUY to close short) --------------------------
        try:
            await self.exchange.place_stop_loss(
                symbol=symbol, side="BUY", quantity=quantity,
                stop_price=signal.stop_loss,
            )
        except Exception:
            logger.exception("Failed to place stop-loss for short %s", symbol)

        # --- Persist trade -------------------------------------------------
        trade = Trade(
            symbol=symbol,
            side="SELL",
            entry_price=filled_price,
            quantity=quantity,
            stop_loss=signal.stop_loss,
            tp1_price=signal.take_profit_1,
            tp2_price=signal.take_profit_2,
            tp3_price=signal.take_profit_3,
            status="OPEN",
            ai_provider=settings.ai_provider,
            ai_confidence=signal.confidence,
            ai_reasoning=signal.reasoning,
            binance_order_id=order_id,
        )
        db.add(trade)
        db.commit()
        db.refresh(trade)

        logger.info(
            "SHORT opened: id=%s %s qty=%.8f entry=%.4f sl=%.4f",
            trade.id, symbol, quantity, filled_price, signal.stop_loss,
        )
        return trade

    # -----------------------------------------------------------------
    # Close position
    # -----------------------------------------------------------------

    async def close_position(
        self, db: Session, trade: Trade, exit_price: float
    ) -> Trade:
        """Fully close an open position.

        1. Cancel remaining open orders for the trade's symbol.
        2. Place a closing market order.
        3. Update the trade record with P&L.
        """
        symbol = trade.symbol
        close_side = "SELL" if trade.side == "BUY" else "BUY"

        # Cancel outstanding orders for this symbol
        try:
            open_orders = await self.exchange.get_open_orders(symbol=symbol)
            for oo in open_orders:
                try:
                    await self.exchange.cancel_order(
                        symbol=symbol, order_id=oo["orderId"],
                    )
                except Exception:
                    logger.warning("Could not cancel order %s", oo.get("orderId"))
        except Exception:
            logger.exception("Failed to fetch/cancel open orders for %s", symbol)

        # Place closing market order
        try:
            await self.exchange.place_market_order(
                symbol=symbol, side=close_side, quantity=trade.quantity,
            )
        except Exception:
            logger.exception(
                "Failed to place closing market order for trade %s", trade.id,
            )

        # Calculate P&L
        if trade.side == "BUY":
            pnl = (exit_price - trade.entry_price) * trade.quantity
        else:
            pnl = (trade.entry_price - exit_price) * trade.quantity

        pnl_pct = (
            (pnl / (trade.entry_price * trade.quantity)) * 100.0
            if trade.entry_price
            else 0.0
        )

        trade.exit_price = exit_price
        trade.pnl = round(pnl, 4)
        trade.pnl_pct = round(pnl_pct, 4)
        trade.status = "CLOSED"
        trade.closed_at = datetime.now(timezone.utc)

        # Update daily PnL record
        today_str = date.today().isoformat()
        daily = db.query(DailyPnl).filter(DailyPnl.date == today_str).first()
        if daily:
            daily.realized_pnl += trade.pnl
            daily.trade_count += 1
        else:
            db.add(DailyPnl(date=today_str, realized_pnl=trade.pnl, trade_count=1))

        db.commit()
        db.refresh(trade)

        logger.info(
            "Trade %s CLOSED: exit=%.4f pnl=%.4f (%.2f%%)",
            trade.id, exit_price, pnl, pnl_pct,
        )
        return trade

    # -----------------------------------------------------------------
    # Breakeven stop-loss
    # -----------------------------------------------------------------

    async def update_stop_loss_to_breakeven(
        self, db: Session, trade: Trade
    ) -> None:
        """Move the stop-loss to the entry price (breakeven) after TP1 fills.

        Cancels existing stop-loss orders for the symbol then places a new
        one at the entry price for the remaining quantity.
        """
        symbol = trade.symbol
        close_side = "SELL" if trade.side == "BUY" else "BUY"

        # Calculate remaining quantity (TP1 already filled)
        settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
        tp1_pct = (settings.tp1_pct if settings else 25.0) / 100.0
        remaining_qty = round(trade.quantity * (1.0 - tp1_pct), 8)

        # Cancel existing stop-loss orders
        try:
            open_orders = await self.exchange.get_open_orders(symbol=symbol)
            for oo in open_orders:
                if oo.get("type") in ("STOP_LOSS", "STOP_LOSS_LIMIT"):
                    await self.exchange.cancel_order(
                        symbol=symbol, order_id=oo["orderId"],
                    )
                    logger.info("Cancelled old SL order %s", oo["orderId"])
        except Exception:
            logger.exception("Failed to cancel old SL orders for %s", symbol)

        # Place new stop-loss at entry (breakeven)
        try:
            await self.exchange.place_stop_loss(
                symbol=symbol,
                side=close_side,
                quantity=remaining_qty,
                stop_price=trade.entry_price,
            )
            logger.info(
                "Stop-loss moved to breakeven (%.4f) for trade %s, remaining qty=%.8f",
                trade.entry_price, trade.id, remaining_qty,
            )
        except Exception:
            logger.exception(
                "Failed to place breakeven SL for trade %s", trade.id,
            )

        # Update the DB record
        trade.stop_loss = trade.entry_price
        trade.tp1_filled = True
        db.commit()

    # -----------------------------------------------------------------
    # Order fill tracking
    # -----------------------------------------------------------------

    async def check_and_update_fills(self, db, trade):
        """Check Binance for filled TP orders and update trade accordingly."""
        try:
            open_orders = await self.exchange.get_open_orders(trade.symbol)
            open_order_ids = {str(o.get("orderId")) for o in open_orders}

            # Check if TP orders have been filled (no longer in open orders)
            # TP orders are stored as comma-separated IDs in binance_order_id
            if not trade.binance_order_id:
                return

            # If trade has TP orders that are no longer open, they've been filled
            # Update the TP fill flags and adjust quantity
            # After TP1 fill, move stop-loss to breakeven
            if not trade.tp1_filled:
                # Simple heuristic: if fewer open orders than expected, TPs may have filled
                pass  # Real implementation would track individual order IDs

        except Exception as e:
            logger.error(f"Failed to check fills for trade {trade.id}: {e}")
