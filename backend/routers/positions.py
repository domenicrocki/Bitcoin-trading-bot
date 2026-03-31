from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Trade
from schemas import TradeResponse

router = APIRouter(prefix="/api", tags=["positions"])


@router.get("/positions", response_model=List[TradeResponse])
def get_open_positions(db: Session = Depends(get_db)):
    trades = (
        db.query(Trade)
        .filter(Trade.status == "OPEN")
        .order_by(Trade.opened_at.desc())
        .all()
    )
    return trades


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
