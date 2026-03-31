from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import JournalEntry
from schemas import AnalysisResponse
from services.trading_engine import engine

router = APIRouter(prefix="/api", tags=["analysis"])


@router.get("/analysis/latest", response_model=AnalysisResponse)
def get_latest_analysis(db: Session = Depends(get_db)):
    entry = (
        db.query(JournalEntry)
        .order_by(JournalEntry.timestamp.desc())
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="No analysis found")
    return entry


@router.post("/analysis/trigger")
async def trigger_analysis(background_tasks: BackgroundTasks):
    if not engine.is_running:
        raise HTTPException(status_code=400, detail="Bot is not running")
    background_tasks.add_task(engine._run_cycle_wrapper)
    return {"status": "triggered"}


@router.get("/journal", response_model=List[AnalysisResponse])
def get_journal(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    entries = (
        db.query(JournalEntry)
        .order_by(JournalEntry.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return entries
