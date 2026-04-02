"""Trade execution service with staged take-profit management.

Handles the full lifecycle of a trade: entry, staged TP exits, stop-loss
placement, breakeven updates, and position closure.
"""

import logging
import math
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from config import BOT_TIMEZONE
from models import BotSettings, DailyPnl, Trade
from schemas import Signal
from services.exchange import BinanceExchange
from services.risk_manager import RiskManager
from services.websocket_manager import ConnectionManager

logger = logging.getLogger(__name__)

# Quantity precision per asset (decimal places for Binance lot size)
_QTY_PRECISION = {
    "BTCUSDT": 5, "ETHUSDT": 4, "BNBUSDT": 2, "XRPUSDT": 0,
    "SOLUSDT": 2, "TRXUSDT": 0,
}
# Price precision per asset
_PRICE_PRECISION = {
    "BTCUSDT": 2, "ETHUSDT": 2, "BNBUSDT": 2, "XRPUSDT": 4,
    "SOLUSDT": 2, "TRXUSDT": 5,
}


def _round_qty(symbol: str, qty: float) -> float:
    """Round quantity to the exchange's lot-size precision."""
    prec = _QTY_PRECISION.get(symbol, 5)
    factor = 10 ** prec
    return math.floor(qty * factor) / factor


def _round_price(symbol: str, price: float) -> float:
    """Round price to the exchange's tick-size precision."""
    prec = _PRICE_PRECISION.get(symbol, 2)
    return round(price, prec)


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

        # Use AI-determined leverage, capped by max from settings
        ai_leverage = getattr(signal, 'leverage', 1) or 1
        effective_leverage = min(ai_leverage, settings.leverage or 10)
        logger.info("LONG trade leverage: AI=%dx, max=%dx, effective=%dx",
                     ai_leverage, settings.leverage or 10, effective_leverage)

        quantity = self.risk_manager.calculate_position_size(
            balance=balance,
            risk_pct=risk_pct,
            entry_price=signal.entry_price,
            stop_loss_price=signal.stop_loss,
            leverage=effective_leverage,
        )
        # Round quantity for exchange precision
        quantity = _round_qty(symbol, quantity)
        if quantity <= 0:
            logger.error("Position size is zero after rounding -- aborting long entry")
            return None

        logger.info("LONG entry: %s qty=%.8f @ ~%.2f (SL=%.2f, TP1=%.2f)",
                     symbol, quantity, signal.entry_price, signal.stop_loss, signal.take_profit_1)

        # --- Market BUY ----------------------------------------------------
        try:
            entry_order = await self.exchange.place_market_order(
                symbol=symbol, side="BUY", quantity=quantity,
            )
        except Exception as exc:
            logger.exception("FAILED to place market BUY for %s: %s", symbol, exc)
            raise  # Re-raise so trading_engine logs it as execution error

        filled_price = float(
            entry_order.get("fills", [{}])[0].get("price", signal.entry_price)
        )
        order_id = str(entry_order.get("orderId", ""))
        logger.info("Market BUY filled: %s orderId=%s price=%.2f", symbol, order_id, filled_price)

        # --- TP split quantities -------------------------------------------
        tp1_pct = (settings.tp1_pct or 25.0) / 100.0
        tp2_pct = (settings.tp2_pct or 50.0) / 100.0
        tp3_pct = (settings.tp3_pct or 25.0) / 100.0

        tp1_qty = _round_qty(symbol, quantity * tp1_pct)
        tp2_qty = _round_qty(symbol, quantity * tp2_pct)
        tp3_qty = _round_qty(symbol, quantity - tp1_qty - tp2_qty)

        # --- Limit SELL orders for TPs ------------------------------------
        tp_order_ids = {"TP1": "", "TP2": "", "TP3": ""}
        for tp_price, tp_qty, label in [
            (signal.take_profit_1, tp1_qty, "TP1"),
            (signal.take_profit_2, tp2_qty, "TP2"),
            (signal.take_profit_3, tp3_qty, "TP3"),
        ]:
            if tp_qty <= 0:
                logger.warning("%s quantity is 0 after rounding, skipping", label)
                continue
            try:
                tp_order = await self.exchange.place_limit_order(
                    symbol=symbol, side="SELL", quantity=tp_qty,
                    price=_round_price(symbol, tp_price),
                )
                tp_order_ids[label] = str(tp_order.get("orderId", ""))
                logger.info(
                    "%s SELL order placed: qty=%.8f @ %.4f orderId=%s",
                    label, tp_qty, tp_price, tp_order_ids[label],
                )
            except Exception:
                logger.exception("Failed to place %s limit SELL", label)

        # --- Stop-loss order -----------------------------------------------
        sl_order_id = ""
        try:
            sl_order = await self.exchange.place_stop_loss(
                symbol=symbol, side="SELL", quantity=quantity,
                stop_price=_round_price(symbol, signal.stop_loss),
            )
            sl_order_id = str(sl_order.get("orderId", ""))
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
            tp1_order_id=tp_order_ids.get("TP1", ""),
            tp2_order_id=tp_order_ids.get("TP2", ""),
            tp3_order_id=tp_order_ids.get("TP3", ""),
            sl_order_id=sl_order_id,
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

        # Use AI-determined leverage, capped by max from settings
        ai_leverage = getattr(signal, 'leverage', 1) or 1
        effective_leverage = min(ai_leverage, settings.leverage or 10)
        logger.info("SHORT trade leverage: AI=%dx, max=%dx, effective=%dx",
                     ai_leverage, settings.leverage or 10, effective_leverage)

        quantity = self.risk_manager.calculate_position_size(
            balance=balance,
            risk_pct=risk_pct,
            entry_price=signal.entry_price,
            stop_loss_price=signal.stop_loss,
            leverage=effective_leverage,
        )
        quantity = _round_qty(symbol, quantity)
        if quantity <= 0:
            logger.error("Position size is zero after rounding -- aborting short entry")
            return None

        logger.info("SHORT entry: %s qty=%.8f @ ~%.2f (SL=%.2f, TP1=%.2f)",
                     symbol, quantity, signal.entry_price, signal.stop_loss, signal.take_profit_1)

        # --- Market SELL ---------------------------------------------------
        try:
            entry_order = await self.exchange.place_market_order(
                symbol=symbol, side="SELL", quantity=quantity,
            )
        except Exception as exc:
            logger.exception("FAILED to place market SELL for %s: %s", symbol, exc)
            raise  # Re-raise so trading_engine logs it

        filled_price = float(
            entry_order.get("fills", [{}])[0].get("price", signal.entry_price)
        )
        order_id = str(entry_order.get("orderId", ""))
        logger.info("Market SELL filled: %s orderId=%s price=%.2f", symbol, order_id, filled_price)

        # --- TP split quantities -------------------------------------------
        tp1_pct = (settings.tp1_pct or 25.0) / 100.0
        tp2_pct = (settings.tp2_pct or 50.0) / 100.0
        tp3_pct = (settings.tp3_pct or 25.0) / 100.0

        tp1_qty = _round_qty(symbol, quantity * tp1_pct)
        tp2_qty = _round_qty(symbol, quantity * tp2_pct)
        tp3_qty = _round_qty(symbol, quantity - tp1_qty - tp2_qty)

        # --- Limit BUY orders for TPs (shorts close by buying) ------------
        tp_order_ids = {"TP1": "", "TP2": "", "TP3": ""}
        for tp_price, tp_qty, label in [
            (signal.take_profit_1, tp1_qty, "TP1"),
            (signal.take_profit_2, tp2_qty, "TP2"),
            (signal.take_profit_3, tp3_qty, "TP3"),
        ]:
            if tp_qty <= 0:
                logger.warning("%s quantity is 0 after rounding, skipping", label)
                continue
            try:
                tp_order = await self.exchange.place_limit_order(
                    symbol=symbol, side="BUY", quantity=tp_qty,
                    price=_round_price(symbol, tp_price),
                )
                tp_order_ids[label] = str(tp_order.get("orderId", ""))
                logger.info(
                    "%s BUY order placed: qty=%.8f @ %.4f orderId=%s",
                    label, tp_qty, tp_price, tp_order_ids[label],
                )
            except Exception:
                logger.exception("Failed to place %s limit BUY", label)

        # --- Stop-loss order (BUY to close short) --------------------------
        sl_order_id = ""
        try:
            sl_order = await self.exchange.place_stop_loss(
                symbol=symbol, side="BUY", quantity=quantity,
                stop_price=_round_price(symbol, signal.stop_loss),
            )
            sl_order_id = str(sl_order.get("orderId", ""))
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
            tp1_order_id=tp_order_ids.get("TP1", ""),
            tp2_order_id=tp_order_ids.get("TP2", ""),
            tp3_order_id=tp_order_ids.get("TP3", ""),
            sl_order_id=sl_order_id,
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
        trade.closed_at = datetime.now(BOT_TIMEZONE)

        # Update daily PnL record
        today_str = datetime.now(BOT_TIMEZONE).date().isoformat()
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

    async def check_and_update_fills(self, db: Session, trade: Trade) -> bool:
        """Check exchange for filled TP/SL orders and update trade.

        Returns True if the trade was fully closed (all TPs or SL hit).
        """
        changed = False
        try:
            open_orders = await self.exchange.get_open_orders(trade.symbol)
            open_order_ids = {str(o.get("orderId")) for o in open_orders}

            # Check TP1
            if not trade.tp1_filled and trade.tp1_order_id:
                if trade.tp1_order_id not in open_order_ids:
                    trade.tp1_filled = True
                    changed = True
                    logger.info("Trade #%d: TP1 FILLED (order %s)", trade.id, trade.tp1_order_id)
                    # Move stop-loss to breakeven
                    try:
                        await self.update_stop_loss_to_breakeven(db, trade)
                        logger.info("Trade #%d: SL moved to breakeven @ %.2f", trade.id, trade.entry_price)
                    except Exception:
                        logger.exception("Trade #%d: Failed to move SL to breakeven", trade.id)

            # Check TP2
            if not trade.tp2_filled and trade.tp2_order_id:
                if trade.tp2_order_id not in open_order_ids:
                    trade.tp2_filled = True
                    changed = True
                    logger.info("Trade #%d: TP2 FILLED (order %s)", trade.id, trade.tp2_order_id)

            # Check TP3
            if not trade.tp3_filled and trade.tp3_order_id:
                if trade.tp3_order_id not in open_order_ids:
                    trade.tp3_filled = True
                    changed = True
                    logger.info("Trade #%d: TP3 FILLED (order %s)", trade.id, trade.tp3_order_id)

            # Check SL (if SL order no longer open, position was stopped out)
            if trade.sl_order_id and trade.sl_order_id not in open_order_ids:
                # SL was hit — check if it's not because TPs cancelled it
                if not (trade.tp1_filled and trade.tp2_filled and trade.tp3_filled):
                    logger.info("Trade #%d: STOP-LOSS HIT (order %s)", trade.id, trade.sl_order_id)
                    # Close trade at stop-loss price
                    trade.exit_price = trade.stop_loss
                    is_long = trade.side == "BUY"
                    if is_long:
                        trade.pnl = round((trade.stop_loss - trade.entry_price) * trade.quantity, 2)
                    else:
                        trade.pnl = round((trade.entry_price - trade.stop_loss) * trade.quantity, 2)
                    trade.pnl_pct = round((trade.pnl / (trade.entry_price * trade.quantity)) * 100, 2) if trade.entry_price * trade.quantity > 0 else 0
                    trade.status = "CLOSED"
                    trade.closed_at = datetime.now(BOT_TIMEZONE)
                    changed = True
                    # Update daily PnL
                    self._update_daily_pnl(db, trade.pnl)

            # If all 3 TPs filled → auto-close trade
            if trade.tp1_filled and trade.tp2_filled and trade.tp3_filled and trade.status == "OPEN":
                logger.info("Trade #%d: ALL TPs FILLED — closing trade", trade.id)
                # Calculate weighted average exit price
                tp1_pct = 0.25
                tp2_pct = 0.50
                tp3_pct = 0.25
                avg_exit = (
                    (trade.tp1_price or 0) * tp1_pct +
                    (trade.tp2_price or 0) * tp2_pct +
                    (trade.tp3_price or 0) * tp3_pct
                )
                trade.exit_price = round(avg_exit, 2)
                is_long = trade.side == "BUY"
                if is_long:
                    trade.pnl = round((avg_exit - trade.entry_price) * trade.quantity, 2)
                else:
                    trade.pnl = round((trade.entry_price - avg_exit) * trade.quantity, 2)
                trade.pnl_pct = round((trade.pnl / (trade.entry_price * trade.quantity)) * 100, 2) if trade.entry_price * trade.quantity > 0 else 0
                trade.status = "CLOSED"
                trade.closed_at = datetime.now(BOT_TIMEZONE)
                # Cancel remaining SL order
                if trade.sl_order_id and trade.sl_order_id in open_order_ids:
                    try:
                        await self.exchange.cancel_order(trade.symbol, trade.sl_order_id)
                    except Exception:
                        logger.exception("Failed to cancel SL after all TPs filled")
                # Update daily PnL
                self._update_daily_pnl(db, trade.pnl)

            if changed:
                db.commit()
                # Broadcast update
                await self.ws_manager.broadcast_position_update({
                    "id": trade.id,
                    "tp1_filled": trade.tp1_filled,
                    "tp2_filled": trade.tp2_filled,
                    "tp3_filled": trade.tp3_filled,
                    "status": trade.status,
                    "pnl": trade.pnl,
                })

            return trade.status == "CLOSED"

        except Exception as e:
            logger.error("Failed to check fills for trade #%d: %s", trade.id, e)
            return False

    def _update_daily_pnl(self, db: Session, pnl: float) -> None:
        """Update the daily PnL record."""
        today_str = datetime.now(BOT_TIMEZONE).date().isoformat()
        daily = db.query(DailyPnl).filter(DailyPnl.date == today_str).first()
        if daily:
            daily.realized_pnl += pnl
            daily.trade_count += 1
        else:
            db.add(DailyPnl(date=today_str, realized_pnl=pnl, trade_count=1))
