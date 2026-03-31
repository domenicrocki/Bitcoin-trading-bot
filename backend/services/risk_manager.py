"""Risk management system for the trading bot.

Enforces position limits, daily loss warnings, max drawdown blocks,
and signal validation before any trade is executed.
"""

import logging
from datetime import date, datetime
from typing import Tuple

from sqlalchemy.orm import Session

from models import BotSettings, DailyPnl, EquitySnapshot, Trade
from schemas import Signal

logger = logging.getLogger(__name__)


class RiskManager:
    """Centralised risk gatekeeper called before every trade."""

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def can_open_position(
        self, db: Session, settings: BotSettings
    ) -> Tuple[bool, str]:
        """Return *(allowed, reason)* indicating whether a new position may
        be opened given current risk constraints.

        Checks (in order):
        1. Max open positions (blocks)
        2. Max drawdown (blocks)
        3. Daily loss limit (warns only -- does **not** block)
        """
        # 1. Position count -------------------------------------------------
        open_count = (
            db.query(Trade).filter(Trade.status == "OPEN").count()
        )
        max_positions = settings.max_positions or 3
        if open_count >= max_positions:
            reason = (
                f"Max open positions reached ({open_count}/{max_positions})"
            )
            logger.warning("Risk BLOCK: %s", reason)
            return False, reason

        # 2. Drawdown -------------------------------------------------------
        drawdown_pct, drawdown_exceeded = self.check_drawdown(db, settings)
        if drawdown_exceeded:
            reason = (
                f"Max drawdown exceeded ({drawdown_pct:.2f}% >= "
                f"{settings.max_drawdown_pct:.2f}%)"
            )
            logger.warning("Risk BLOCK: %s", reason)
            return False, reason

        # 3. Daily loss (warning only) --------------------------------------
        daily_pnl, is_warning = self.check_daily_loss(db, settings)
        if is_warning:
            reason = (
                f"Daily loss warning: {daily_pnl:.2f} USDT "
                f"(limit {settings.daily_loss_limit_pct:.1f}%)"
            )
            logger.warning("Risk WARNING (not blocking): %s", reason)
            # Intentionally NOT returning False -- trading continues.

        return True, "All risk checks passed"

    # -----------------------------------------------------------------
    # Position sizing
    # -----------------------------------------------------------------

    @staticmethod
    def calculate_position_size(
        balance: float,
        risk_pct: float,
        entry_price: float,
        stop_loss_price: float,
        leverage: int = 1,
    ) -> float:
        """Calculate the maximum position quantity based on a fixed
        percentage risk of total capital, accounting for leverage.

        Parameters
        ----------
        balance : float
            Available USDT balance.
        risk_pct : float
            Percentage of balance willing to lose (e.g. 1.0 for 1 %).
        entry_price : float
            Planned entry price.
        stop_loss_price : float
            Planned stop-loss price.
        leverage : int
            Leverage multiplier (default 1x).

        Returns
        -------
        float
            Quantity (in base asset units) rounded to 8 decimals.
        """
        if entry_price <= 0 or stop_loss_price <= 0:
            logger.error(
                "Invalid prices for position sizing: entry=%s sl=%s",
                entry_price, stop_loss_price,
            )
            return 0.0

        risk_per_unit = abs(entry_price - stop_loss_price)
        if risk_per_unit == 0:
            logger.error("Entry and stop-loss are identical -- cannot size")
            return 0.0

        leverage = max(1, leverage)
        risk_amount = balance * (risk_pct / 100.0)
        quantity = risk_amount / risk_per_unit

        # Sanity cap: position notional must not exceed balance * leverage
        max_quantity = (balance * leverage) / entry_price
        quantity = min(quantity, max_quantity)

        quantity = round(quantity, 8)
        logger.info(
            "Position size: balance=%.2f risk=%.1f%% leverage=%dx entry=%.4f sl=%.4f -> qty=%.8f",
            balance, risk_pct, leverage, entry_price, stop_loss_price, quantity,
        )
        return quantity

    # -----------------------------------------------------------------
    # Daily P&L
    # -----------------------------------------------------------------

    def check_daily_loss(
        self, db: Session, settings: BotSettings | None = None
    ) -> Tuple[float, bool]:
        """Return *(daily_pnl, is_warning)* for today's realised P&L.

        ``is_warning`` is ``True`` when the loss exceeds the configured
        ``daily_loss_limit_pct`` of the latest equity snapshot.
        """
        today_str = date.today().isoformat()
        row = db.query(DailyPnl).filter(DailyPnl.date == today_str).first()
        daily_pnl = row.realized_pnl if row else 0.0

        # Also sum closed trades from today that may not yet be flushed
        today_start = datetime.combine(date.today(), datetime.min.time())
        closed_today_pnl = (
            db.query(Trade)
            .filter(
                Trade.status == "CLOSED",
                Trade.closed_at >= today_start,
                Trade.pnl.isnot(None),
            )
            .with_entities(Trade.pnl)
            .all()
        )
        realised = sum(r.pnl for r in closed_today_pnl)

        # Use the more complete number
        daily_pnl = realised if abs(realised) > abs(daily_pnl) else daily_pnl

        # Determine warning threshold
        is_warning = False
        if settings is not None and daily_pnl < 0:
            latest_equity = (
                db.query(EquitySnapshot)
                .order_by(EquitySnapshot.timestamp.desc())
                .first()
            )
            if latest_equity and latest_equity.equity > 0:
                loss_pct = (abs(daily_pnl) / latest_equity.equity) * 100.0
                limit = settings.daily_loss_limit_pct or 5.0
                if loss_pct >= limit:
                    is_warning = True

        return daily_pnl, is_warning

    # -----------------------------------------------------------------
    # Drawdown
    # -----------------------------------------------------------------

    def check_drawdown(
        self, db: Session, settings: BotSettings | None = None
    ) -> Tuple[float, bool]:
        """Return *(drawdown_pct, is_exceeded)* calculated from the peak
        equity recorded in snapshots vs the most recent snapshot.
        """
        peak_snapshot = (
            db.query(EquitySnapshot)
            .order_by(EquitySnapshot.equity.desc())
            .first()
        )
        latest_snapshot = (
            db.query(EquitySnapshot)
            .order_by(EquitySnapshot.timestamp.desc())
            .first()
        )

        if not peak_snapshot or not latest_snapshot:
            return 0.0, False

        peak_equity = peak_snapshot.equity
        if peak_equity <= 0:
            return 0.0, False

        current_equity = latest_snapshot.equity
        drawdown_pct = ((peak_equity - current_equity) / peak_equity) * 100.0
        drawdown_pct = max(drawdown_pct, 0.0)  # floor at 0

        max_allowed = (settings.max_drawdown_pct if settings else 20.0) or 20.0
        is_exceeded = drawdown_pct >= max_allowed

        if is_exceeded:
            logger.warning(
                "Drawdown %.2f%% exceeds max %.2f%%", drawdown_pct, max_allowed,
            )

        return drawdown_pct, is_exceeded

    # -----------------------------------------------------------------
    # Signal validation
    # -----------------------------------------------------------------

    def validate_signal(
        self, signal: Signal, settings: BotSettings
    ) -> Tuple[bool, str]:
        """Validate that a parsed AI signal meets minimum requirements.

        Checks:
        * Action is BUY or SELL (not HOLD).
        * Shorts allowed when action is SELL.
        * Confidence >= ``settings.min_confidence``.
        * Risk-reward ratio >= 1:2 (TP1 vs stop-loss distance).
        * Prices are positive and consistent with direction.
        """
        # Action gate
        if signal.action == "HOLD":
            return False, "Signal is HOLD; no trade to execute"

        if signal.action == "SELL" and not settings.allow_shorts:
            return False, "Short selling is disabled in settings"

        # Confidence
        min_conf = settings.min_confidence or 70
        if signal.confidence < min_conf:
            reason = f"Confidence too low ({signal.confidence} < {min_conf})"
            logger.info("Signal rejected: %s", reason)
            return False, reason

        # Direction checks
        if signal.action == "BUY":
            if signal.stop_loss >= signal.entry_price:
                return False, "BUY signal stop-loss must be below entry"
            if signal.take_profit_1 <= signal.entry_price:
                return False, "BUY signal TP1 must be above entry"
        elif signal.action == "SELL":
            if signal.stop_loss <= signal.entry_price:
                return False, "SELL signal stop-loss must be above entry"
            if signal.take_profit_1 >= signal.entry_price:
                return False, "SELL signal TP1 must be below entry"
        else:
            return False, f"Unexpected action '{signal.action}'"

        # Risk-reward ratio (using TP1 as the minimum reward target -- min 1:2)
        risk = abs(signal.entry_price - signal.stop_loss)
        reward = abs(signal.take_profit_1 - signal.entry_price)
        if risk == 0:
            return False, "Risk is zero (entry == stop-loss)"
        rrr = reward / risk
        if rrr < 2.0:
            reason = f"Risk-reward ratio too low ({rrr:.2f}:1, min 2:1)"
            logger.info("Signal rejected: %s", reason)
            return False, reason

        # Price sanity
        for label, val in [
            ("entry", signal.entry_price),
            ("stop_loss", signal.stop_loss),
            ("TP1", signal.take_profit_1),
            ("TP2", signal.take_profit_2),
            ("TP3", signal.take_profit_3),
        ]:
            if val <= 0:
                return False, f"{label} price must be positive (got {val})"

        logger.info(
            "Signal validated: %s confidence=%d RRR=%.2f:1",
            signal.action, signal.confidence, rrr,
        )
        return True, "Signal validated"
