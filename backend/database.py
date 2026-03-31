from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from config import get_settings

engine = create_engine(
    get_settings().database_url,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from models import Trade, BotSettings, JournalEntry, EquitySnapshot, DailyPnl  # noqa
    Base.metadata.create_all(bind=engine)
    # Create default settings if not exists
    db = SessionLocal()
    try:
        existing = db.query(BotSettings).filter(BotSettings.id == 1).first()
        if not existing:
            db.add(BotSettings(id=1))
            db.commit()
    finally:
        db.close()
