from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Trade, EquitySnapshot, DailyPnl, BotSettings
from schemas import AccountResponse, EquityPoint, Candle, SUPPORTED_PAIRS, SUPPORTED_INTERVALS
from services.trading_engine import engine

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/account", response_model=AccountResponse)
async def get_account(db: Session = Depends(get_db)):
    latest_snapshot = (
        db.query(EquitySnapshot)
        .order_by(EquitySnapshot.timestamp.desc())
        .first()
    )

    # If no snapshots yet, fetch live balance from Binance
    if latest_snapshot:
        balance = latest_snapshot.balance
        equity = latest_snapshot.equity
        daily_pnl = latest_snapshot.daily_pnl or 0.0
    else:
        try:
            settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
            active_exchange = engine._get_exchange(getattr(settings, 'exchange', 'binance') or 'binance')
            balance = await active_exchange.get_balance()
            equity = balance
        except Exception:
            balance = 0.0
            equity = 0.0
        daily_pnl = 0.0

    closed_trades = db.query(Trade).filter(Trade.status == "CLOSED").all()
    total_closed = len(closed_trades)

    total_pnl = sum(t.pnl for t in closed_trades if t.pnl is not None)
    winning_trades = sum(1 for t in closed_trades if t.pnl is not None and t.pnl > 0)
    win_rate = (winning_trades / total_closed * 100.0) if total_closed > 0 else 0.0

    open_count = db.query(Trade).filter(Trade.status == "OPEN").count()

    total_pnl_pct = (total_pnl / balance * 100.0) if balance > 0 else 0.0

    # Calculate max drawdown from equity snapshots
    max_drawdown = 0.0
    snapshots = (
        db.query(EquitySnapshot)
        .order_by(EquitySnapshot.timestamp.asc())
        .all()
    )
    if snapshots:
        peak = snapshots[0].equity
        for snap in snapshots:
            if snap.equity > peak:
                peak = snap.equity
            drawdown = (peak - snap.equity) / peak * 100.0 if peak > 0 else 0.0
            if drawdown > max_drawdown:
                max_drawdown = drawdown

    return AccountResponse(
        balance=balance,
        equity=equity,
        total_pnl=total_pnl,
        total_pnl_pct=total_pnl_pct,
        win_rate=win_rate,
        total_trades=total_closed,
        open_positions=open_count,
        daily_pnl=daily_pnl,
        max_drawdown=max_drawdown,
    )


@router.get("/account/equity-curve", response_model=List[EquityPoint])
def get_equity_curve(db: Session = Depends(get_db)):
    snapshots = (
        db.query(EquitySnapshot)
        .order_by(EquitySnapshot.timestamp.asc())
        .all()
    )
    return [
        EquityPoint(
            timestamp=s.timestamp,
            equity=s.equity,
            daily_pnl=s.daily_pnl or 0.0,
        )
        for s in snapshots
    ]


@router.get("/portfolio")
async def get_portfolio(db: Session = Depends(get_db)):
    """Live portfolio overview synced with exchange."""
    settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
    exchange_name = getattr(settings, 'exchange', 'binance') or 'binance'
    active_exchange = engine._get_exchange(exchange_name)

    # 1. Live balance from exchange
    try:
        usdt_balance = await active_exchange.get_balance("USDT")
    except Exception:
        usdt_balance = 0.0

    # 2. Open positions from DB with live prices
    open_trades = db.query(Trade).filter(Trade.status == "OPEN").order_by(Trade.opened_at.desc()).all()
    positions = []
    total_unrealized = 0.0
    for t in open_trades:
        try:
            price = await active_exchange.get_ticker_price(t.symbol)
        except Exception:
            price = t.entry_price
        is_long = t.side == "BUY"
        unrealized = (price - t.entry_price) * t.quantity if is_long else (t.entry_price - price) * t.quantity
        unrealized_pct = (unrealized / (t.entry_price * t.quantity)) * 100 if t.entry_price * t.quantity > 0 else 0
        total_unrealized += unrealized
        positions.append({
            "id": t.id, "symbol": t.symbol, "side": "LONG" if is_long else "SHORT",
            "entry_price": t.entry_price, "current_price": round(price, 2),
            "quantity": t.quantity, "leverage": t.ai_confidence,  # stored leverage
            "stop_loss": t.stop_loss,
            "tp1": t.tp1_price, "tp2": t.tp2_price, "tp3": t.tp3_price,
            "tp1_filled": t.tp1_filled, "tp2_filled": t.tp2_filled, "tp3_filled": t.tp3_filled,
            "unrealized_pnl": round(unrealized, 2),
            "unrealized_pnl_pct": round(unrealized_pct, 2),
            "opened_at": t.opened_at.isoformat() if t.opened_at else None,
        })

    # 3. Closed trades (last 20)
    closed_trades = db.query(Trade).filter(Trade.status == "CLOSED").order_by(Trade.closed_at.desc()).limit(20).all()
    history = []
    total_realized = 0.0
    wins = 0
    for t in closed_trades:
        is_long = t.side == "BUY"
        total_realized += t.pnl or 0
        if (t.pnl or 0) > 0:
            wins += 1
        history.append({
            "id": t.id, "symbol": t.symbol, "side": "LONG" if is_long else "SHORT",
            "entry_price": t.entry_price, "exit_price": t.exit_price,
            "quantity": t.quantity,
            "pnl": t.pnl, "pnl_pct": t.pnl_pct,
            "ai_provider": t.ai_provider, "ai_confidence": t.ai_confidence,
            "opened_at": t.opened_at.isoformat() if t.opened_at else None,
            "closed_at": t.closed_at.isoformat() if t.closed_at else None,
        })

    # 4. Performance metrics
    equity = usdt_balance + total_unrealized
    total_closed = len(closed_trades)
    win_rate = (wins / total_closed * 100) if total_closed > 0 else 0

    # Drawdown
    peak_snap = db.query(EquitySnapshot).order_by(EquitySnapshot.equity.desc()).first()
    peak_equity = peak_snap.equity if peak_snap else equity
    drawdown = ((peak_equity - equity) / peak_equity * 100) if peak_equity > 0 else 0

    # Daily PnL
    from datetime import datetime as dt, timezone as tz
    today_str = dt.now(tz.utc).date().isoformat()
    daily = db.query(DailyPnl).filter(DailyPnl.date == today_str).first()
    daily_pnl = daily.realized_pnl if daily else 0.0

    return {
        "exchange": exchange_name,
        "balance": round(usdt_balance, 2),
        "equity": round(equity, 2),
        "unrealized_pnl": round(total_unrealized, 2),
        "realized_pnl": round(total_realized, 2),
        "daily_pnl": round(daily_pnl, 2),
        "win_rate": round(win_rate, 1),
        "total_trades": total_closed,
        "max_drawdown": round(max(drawdown, 0), 2),
        "open_positions": positions,
        "closed_trades": history,
    }


@router.get("/candles", response_model=List[Candle])
async def get_candles(
    symbol: str = Query(default="BTCUSDT"),
    interval: str = Query(default="1h"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    if symbol not in SUPPORTED_PAIRS:
        raise HTTPException(status_code=400, detail=f"Unsupported pair: {symbol}")
    if interval not in SUPPORTED_INTERVALS:
        raise HTTPException(status_code=400, detail=f"Unsupported interval: {interval}")

    try:
        settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
        active_exchange = engine._get_exchange(getattr(settings, 'exchange', 'binance') or 'binance')
        df = await active_exchange.get_klines(symbol, interval, limit=limit)
        candles = []
        for idx, row in df.iterrows():
            # idx is a pandas Timestamp (the DataFrame index is "timestamp")
            ts_ms = int(idx.timestamp() * 1000) if hasattr(idx, 'timestamp') else 0
            candles.append(Candle(
                time=ts_ms,
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["volume"]),
            ))
        return candles
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch candles: {e}")
