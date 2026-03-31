// ── Settings ──────────────────────────────────────────────────────────────────

export interface Settings {
  ai_provider: string;
  trading_pair: string;
  leverage: number;
  max_risk_pct: number;
  max_positions: number;
  daily_loss_limit_pct: number;
  max_drawdown_pct: number;
  min_confidence: number;
  analysis_interval: string;
  tp1_pct: number;
  tp2_pct: number;
  tp3_pct: number;
  is_running: boolean;
  allow_shorts: boolean;
}

export interface SettingsUpdate {
  ai_provider?: string;
  trading_pair?: string;
  leverage?: number;
  max_risk_pct?: number;
  max_positions?: number;
  daily_loss_limit_pct?: number;
  max_drawdown_pct?: number;
  min_confidence?: number;
  analysis_interval?: string;
  tp1_pct?: number;
  tp2_pct?: number;
  tp3_pct?: number;
  allow_shorts?: boolean;
}

// ── Trading Signal ───────────────────────────────────────────────────────────

export interface Signal {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  reasoning: string;
}

// ── Trades ───────────────────────────────────────────────────────────────────

export interface Trade {
  id: number;
  symbol: string;
  side: string;
  entry_price: number;
  quantity: number;
  stop_loss: number | null;
  tp1_price: number | null;
  tp2_price: number | null;
  tp3_price: number | null;
  tp1_filled: boolean;
  tp2_filled: boolean;
  tp3_filled: boolean;
  exit_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  status: string;
  ai_provider: string | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  opened_at: string | null;
  closed_at: string | null;
}

// ── Analysis ─────────────────────────────────────────────────────────────────

export interface AnalysisEntry {
  id: number;
  timestamp: string | null;
  symbol: string;
  price_at_analysis: number;
  indicators: string;
  ai_provider: string;
  parsed_action: string | null;
  confidence: number | null;
  risk_check_passed: boolean | null;
  risk_check_reason: string | null;
  trade_id: number | null;
  ai_reasoning: string | null;
}

// ── Account ──────────────────────────────────────────────────────────────────

export interface AccountInfo {
  balance: number;
  equity: number;
  total_pnl: number;
  total_pnl_pct: number;
  win_rate: number;
  total_trades: number;
  open_positions: number;
  daily_pnl: number;
  max_drawdown: number;
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
  daily_pnl: number;
}

// ── Bot Status ───────────────────────────────────────────────────────────────

export interface BotStatus {
  is_running: boolean;
  uptime_seconds: number | null;
  last_analysis: string | null;
  next_analysis: string | null;
  active_pair: string;
  ai_provider: string;
  open_positions: number;
}

// ── Candles ──────────────────────────────────────────────────────────────────

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── WebSocket ────────────────────────────────────────────────────────────────

export interface WebSocketMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const SUPPORTED_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "SOLUSDT",
  "TRXUSDT",
] as const;

export const SUPPORTED_INTERVALS = ["15m", "1h"] as const;

export const SUPPORTED_AI_PROVIDERS = [
  "openai",
  "gemini",
  "anthropic",
] as const;
