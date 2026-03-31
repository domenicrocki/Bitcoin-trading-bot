from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import BotSettings
from schemas import (
    SettingsResponse,
    SettingsUpdate,
    SUPPORTED_PAIRS,
    SUPPORTED_AI_PROVIDERS,
    SUPPORTED_INTERVALS,
)
from services.trading_engine import engine

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return settings


@router.put("/settings", response_model=SettingsResponse)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    settings = db.query(BotSettings).filter(BotSettings.id == 1).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "trading_pair" in update_data and update_data["trading_pair"] not in SUPPORTED_PAIRS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported trading pair. Supported: {SUPPORTED_PAIRS}",
        )

    if "ai_provider" in update_data and update_data["ai_provider"] not in SUPPORTED_AI_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported AI provider. Supported: {SUPPORTED_AI_PROVIDERS}",
        )

    if "analysis_interval" in update_data and update_data["analysis_interval"] not in SUPPORTED_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported interval. Supported: {SUPPORTED_INTERVALS}",
        )

    interval_changed = (
        "analysis_interval" in update_data
        and update_data["analysis_interval"] != settings.analysis_interval
    )

    for field, value in update_data.items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)

    if interval_changed:
        try:
            engine.reschedule(settings.analysis_interval)
        except Exception:
            pass  # Engine may not be running; ignore reschedule errors

    return settings
