from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Trade, BotSettings
from schemas import BotStatus
from services.trading_engine import engine

router = APIRouter(prefix="/api/bot", tags=["trading"])


@router.post("/start")
def start_bot(db: Session = Depends(get_db)):
    try:
        engine.start(db)
        return {"status": "started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop")
def stop_bot():
    try:
        engine.stop()
        return {"status": "stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=BotStatus)
def get_status(db: Session = Depends(get_db)):
    settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Bot settings not found")

    open_count = db.query(Trade).filter(Trade.status == "OPEN").count()

    return BotStatus(
        is_running=engine.is_running,
        uptime_seconds=engine.uptime,
        last_analysis=engine.last_analysis,
        next_analysis=engine.next_analysis,
        active_pair=settings.trading_pair,
        ai_provider=settings.ai_provider,
        open_positions=open_count,
    )
