from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Trade
from schemas import TradeResponse
from services.trading_engine import engine

router = APIRouter(prefix="/api", tags=["positions"])


@router.get("/positions", response_model=List[TradeResponse])
async def get_open_positions(db: Session = Depends(get_db)):
    trades = db.query(Trade).filter(Trade.status == "OPEN").order_by(Trade.opened_at.desc()).all()
    # Calculate unrealized P&L for each position
    for trade in trades:
        try:
            current_price = await engine.exchange.get_ticker_price(trade.symbol)
            if trade.side == "BUY":
                trade.pnl = round((current_price - trade.entry_price) * trade.quantity, 2)
            else:
                trade.pnl = round((trade.entry_price - current_price) * trade.quantity, 2)
            trade.pnl_pct = round((trade.pnl / (trade.entry_price * trade.quantity)) * 100, 2) if trade.entry_price * trade.quantity > 0 else 0
        except Exception:
            pass  # Keep null P&L if price fetch fails
    return trades


@router.post("/positions/{trade_id}/close")
async def close_position(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id, Trade.status == "OPEN").first()
    if not trade:
        raise HTTPException(status_code=404, detail="Open position not found")
    try:
        current_price = await engine.exchange.get_ticker_price(trade.symbol)
        closed = await engine.trade_executor.close_position(db, trade, current_price)
        return {"status": "closed", "trade_id": closed.id, "pnl": closed.pnl}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to close position: {e}")


@router.get("/trades", response_model=List[TradeResponse])
def get_closed_trades(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    trades = (
        db.query(Trade)
        .filter(Trade.status == "CLOSED")
        .order_by(Trade.closed_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return trades


@router.get("/trades/{trade_id}", response_model=TradeResponse)
def get_trade(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade
