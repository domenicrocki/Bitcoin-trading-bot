from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# === Settings ===
class SettingsResponse(BaseModel):
    ai_provider: str
    trading_pair: str
    leverage: int
    max_risk_pct: float
    max_positions: int
    daily_loss_limit_pct: float
    max_drawdown_pct: float
    min_confidence: int
    analysis_interval: str
    tp1_pct: float
    tp2_pct: float
    tp3_pct: float
    is_running: bool
    allow_shorts: bool

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    ai_provider: Optional[str] = None
    trading_pair: Optional[str] = None
    leverage: Optional[int] = None
    max_risk_pct: Optional[float] = None
    max_positions: Optional[int] = None
    daily_loss_limit_pct: Optional[float] = None
    max_drawdown_pct: Optional[float] = None
    min_confidence: Optional[int] = None
    analysis_interval: Optional[str] = None
    tp1_pct: Optional[float] = None
    tp2_pct: Optional[float] = None
    tp3_pct: Optional[float] = None
    allow_shorts: Optional[bool] = None


# === Trading Signal ===
class Signal(BaseModel):
    action: str  # BUY | SELL | HOLD
    confidence: int  # 0-100
    entry_price: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: float
    take_profit_3: float
    reasoning: str


# === Trades ===
class TradeResponse(BaseModel):
    id: int
    symbol: str
    side: str
    entry_price: float
    quantity: float
    stop_loss: Optional[float]
    tp1_price: Optional[float]
    tp2_price: Optional[float]
    tp3_price: Optional[float]
    tp1_filled: bool
    tp2_filled: bool
    tp3_filled: bool
    exit_price: Optional[float]
    pnl: Optional[float]
    pnl_pct: Optional[float]
    status: str
    ai_provider: Optional[str]
    ai_confidence: Optional[int]
    ai_reasoning: Optional[str]
    opened_at: Optional[datetime]
    closed_at: Optional[datetime]

    class Config:
        from_attributes = True


# === Analysis ===
class AnalysisResponse(BaseModel):
    id: int
    timestamp: Optional[datetime]
    symbol: str
    price_at_analysis: float
    indicators: str
    ai_provider: str
    parsed_action: Optional[str]
    confidence: Optional[int]
    risk_check_passed: Optional[bool]
    risk_check_reason: Optional[str]
    trade_id: Optional[int]
    ai_reasoning: Optional[str] = None

    class Config:
        from_attributes = True


# === Account ===
class AccountResponse(BaseModel):
    balance: float
    equity: float
    total_pnl: float
    total_pnl_pct: float
    win_rate: float
    total_trades: int
    open_positions: int
    daily_pnl: float
    max_drawdown: float


class EquityPoint(BaseModel):
    timestamp: datetime
    equity: float
    daily_pnl: float


# === Bot Status ===
class BotStatus(BaseModel):
    is_running: bool
    uptime_seconds: Optional[float] = None
    last_analysis: Optional[datetime] = None
    next_analysis: Optional[datetime] = None
    active_pair: str
    ai_provider: str
    open_positions: int


# === Candles ===
class Candle(BaseModel):
    time: int  # Unix timestamp
    open: float
    high: float
    low: float
    close: float
    volume: float


SUPPORTED_PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "SOLUSDT", "TRXUSDT"]
SUPPORTED_INTERVALS = ["15m", "1h"]
SUPPORTED_AI_PROVIDERS = ["openai", "gemini", "anthropic"]
