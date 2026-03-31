from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from sqlalchemy.sql import func

from database import Base


class BotSettings(Base):
    __tablename__ = "bot_settings"

    id = Column(Integer, primary_key=True, default=1)
    ai_provider = Column(String, nullable=False, default="openai")  # openai | gemini | anthropic
    trading_pair = Column(String, nullable=False, default="BTCUSDT")
    leverage = Column(Integer, nullable=False, default=1)
    max_risk_pct = Column(Float, nullable=False, default=1.0)
    max_positions = Column(Integer, nullable=False, default=3)
    daily_loss_limit_pct = Column(Float, nullable=False, default=5.0)
    max_drawdown_pct = Column(Float, nullable=False, default=20.0)
    min_confidence = Column(Integer, nullable=False, default=70)
    analysis_interval = Column(String, nullable=False, default="1h")  # 15m | 1h
    tp1_pct = Column(Float, nullable=False, default=25.0)
    tp2_pct = Column(Float, nullable=False, default=50.0)
    tp3_pct = Column(Float, nullable=False, default=25.0)
    is_running = Column(Boolean, nullable=False, default=False)
    allow_shorts = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String, nullable=False)
    side = Column(String, nullable=False)  # BUY (LONG) | SELL (SHORT)
    entry_price = Column(Float, nullable=False)
    quantity = Column(Float, nullable=False)
    stop_loss = Column(Float)
    tp1_price = Column(Float)
    tp2_price = Column(Float)
    tp3_price = Column(Float)
    tp1_filled = Column(Boolean, default=False)
    tp2_filled = Column(Boolean, default=False)
    tp3_filled = Column(Boolean, default=False)
    exit_price = Column(Float)
    pnl = Column(Float)
    pnl_pct = Column(Float)
    status = Column(String, nullable=False, default="OPEN")  # OPEN | CLOSED | CANCELLED
    ai_provider = Column(String)
    ai_confidence = Column(Integer)
    ai_reasoning = Column(Text)
    binance_order_id = Column(String)
    opened_at = Column(DateTime, server_default=func.now())
    closed_at = Column(DateTime)


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, server_default=func.now())
    symbol = Column(String, nullable=False)
    price_at_analysis = Column(Float, nullable=False)
    indicators = Column(Text, nullable=False)  # JSON
    ai_provider = Column(String, nullable=False)
    ai_prompt = Column(Text)
    ai_response = Column(Text)
    parsed_action = Column(String)  # BUY | SELL | HOLD
    confidence = Column(Integer)
    risk_check_passed = Column(Boolean)
    risk_check_reason = Column(String)
    trade_id = Column(Integer)
    notes = Column(Text)


class EquitySnapshot(Base):
    __tablename__ = "equity_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, server_default=func.now())
    balance = Column(Float, nullable=False)
    equity = Column(Float, nullable=False)
    daily_pnl = Column(Float, default=0.0)


class DailyPnl(Base):
    __tablename__ = "daily_pnl"

    date = Column(String, primary_key=True)  # YYYY-MM-DD
    realized_pnl = Column(Float, default=0.0)
    trade_count = Column(Integer, default=0)
