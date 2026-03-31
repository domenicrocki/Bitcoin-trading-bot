"""Technical analysis module using pure pandas/numpy.

Computes a comprehensive set of indicators from OHLCV data and provides
helper functions for support/resistance detection and trend classification.
"""

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ======================================================================
# Indicator computation helpers (pure pandas/numpy)
# ======================================================================

def _rsi(series: pd.Series, length: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1 / length, min_periods=length).mean()
    avg_loss = loss.ewm(alpha=1 / length, min_periods=length).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False).mean()


def _sma(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(window=length).mean()


def _macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _bbands(series: pd.Series, length: int = 20, std: float = 2.0):
    middle = _sma(series, length)
    rolling_std = series.rolling(window=length).std()
    upper = middle + std * rolling_std
    lower = middle - std * rolling_std
    bandwidth = (upper - lower) / middle
    percent_b = (series - lower) / (upper - lower)
    return lower, middle, upper, bandwidth, percent_b


def _stoch_rsi(series: pd.Series, length: int = 14, k: int = 3, d: int = 3):
    rsi = _rsi(series, length)
    rsi_min = rsi.rolling(window=length).min()
    rsi_max = rsi.rolling(window=length).max()
    stoch = (rsi - rsi_min) / (rsi_max - rsi_min).replace(0, np.nan) * 100
    stoch_k = stoch.rolling(window=k).mean()
    stoch_d = stoch_k.rolling(window=d).mean()
    return stoch_k, stoch_d


def _adx(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14):
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)

    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = tr.ewm(alpha=1 / length, min_periods=length).mean()
    plus_di = 100 * (plus_dm.ewm(alpha=1 / length, min_periods=length).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(alpha=1 / length, min_periods=length).mean() / atr)

    dx = (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan) * 100
    adx = dx.ewm(alpha=1 / length, min_periods=length).mean()
    return adx, plus_di, minus_di


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / length, min_periods=length).mean()


def _obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff()).fillna(0)
    return (direction * volume).cumsum()


def _vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    typical_price = (high + low + close) / 3
    cum_tp_vol = (typical_price * volume).cumsum()
    cum_vol = volume.cumsum()
    return cum_tp_vol / cum_vol.replace(0, np.nan)


# ======================================================================
# Public API
# ======================================================================

def compute_indicators(df: pd.DataFrame) -> dict:
    """Compute all technical indicators and return the latest values.

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame with columns: open, high, low, close, volume.

    Returns
    -------
    dict  with the latest value for every computed indicator.
    """
    if df.empty:
        raise ValueError("DataFrame is empty; cannot compute indicators.")

    results: dict = {}

    # RSI (14)
    rsi = _rsi(df["close"], 14)
    results["rsi_14"] = _last(rsi)

    # MACD (12, 26, 9)
    macd_line, macd_signal, macd_hist = _macd(df["close"])
    results["macd_line"] = _last(macd_line)
    results["macd_signal"] = _last(macd_signal)
    results["macd_histogram"] = _last(macd_hist)

    # Bollinger Bands (20, 2)
    bb_lower, bb_middle, bb_upper, bb_bw, bb_pct = _bbands(df["close"])
    results["bb_lower"] = _last(bb_lower)
    results["bb_middle"] = _last(bb_middle)
    results["bb_upper"] = _last(bb_upper)
    results["bb_bandwidth"] = _last(bb_bw)
    results["bb_percent"] = _last(bb_pct)

    # EMA (9, 21, 50, 200)
    for period in (9, 21, 50, 200):
        results[f"ema_{period}"] = _last(_ema(df["close"], period))

    # SMA (20, 50, 200)
    for period in (20, 50, 200):
        results[f"sma_{period}"] = _last(_sma(df["close"], period))

    # Stochastic RSI (14)
    stoch_k, stoch_d = _stoch_rsi(df["close"], 14)
    results["stoch_rsi_k"] = _last(stoch_k)
    results["stoch_rsi_d"] = _last(stoch_d)

    # ADX (14)
    adx, plus_di, minus_di = _adx(df["high"], df["low"], df["close"], 14)
    results["adx_14"] = _last(adx)
    results["plus_di"] = _last(plus_di)
    results["minus_di"] = _last(minus_di)

    # ATR (14)
    atr = _atr(df["high"], df["low"], df["close"], 14)
    results["atr_14"] = _last(atr)

    # OBV
    obv = _obv(df["close"], df["volume"])
    results["obv"] = _last(obv)

    # VWAP
    vwap = _vwap(df["high"], df["low"], df["close"], df["volume"])
    results["vwap"] = _last(vwap)

    # Current close price
    results["close"] = _last(df["close"])

    logger.debug("Computed %d indicators", len(results))
    return results


def get_support_resistance(df: pd.DataFrame, window: int = 20) -> dict:
    """Identify recent support and resistance levels using rolling extremes."""
    if len(df) < window:
        return {"support": [], "resistance": []}

    highs = df["high"].values
    lows = df["low"].values

    resistance_levels: list[float] = []
    support_levels: list[float] = []

    half = window // 2

    for i in range(half, len(highs) - half):
        if highs[i] == max(highs[i - half: i + half + 1]):
            resistance_levels.append(float(highs[i]))
        if lows[i] == min(lows[i - half: i + half + 1]):
            support_levels.append(float(lows[i]))

    support_levels = _cluster_levels(support_levels)
    resistance_levels = _cluster_levels(resistance_levels)

    return {
        "support": sorted(support_levels),
        "resistance": sorted(resistance_levels),
    }


def get_trend_direction(indicators: dict) -> str:
    """Classify the current trend as BULLISH, BEARISH, or NEUTRAL."""
    score = 0
    close = indicators.get("close")

    if close is None:
        return "NEUTRAL"

    # EMA alignment
    ema_9 = indicators.get("ema_9")
    ema_21 = indicators.get("ema_21")
    ema_50 = indicators.get("ema_50")
    ema_200 = indicators.get("ema_200")

    if ema_9 is not None and ema_21 is not None:
        score += 1 if ema_9 > ema_21 else -1

    if ema_50 is not None and ema_200 is not None:
        score += 1 if ema_50 > ema_200 else -1

    if ema_200 is not None:
        score += 1 if close > ema_200 else -1

    # MACD
    macd_hist = indicators.get("macd_histogram")
    if macd_hist is not None:
        if macd_hist > 0:
            score += 1
        elif macd_hist < 0:
            score -= 1

    macd_line = indicators.get("macd_line")
    macd_signal = indicators.get("macd_signal")
    if macd_line is not None and macd_signal is not None:
        score += 1 if macd_line > macd_signal else -1

    # RSI
    rsi = indicators.get("rsi_14")
    if rsi is not None:
        if rsi > 60:
            score += 1
        elif rsi < 40:
            score -= 1

    # ADX + DI
    adx = indicators.get("adx_14")
    plus_di = indicators.get("plus_di")
    minus_di = indicators.get("minus_di")
    if adx is not None and plus_di is not None and minus_di is not None:
        if adx > 25:
            score += 2 if plus_di > minus_di else -2

    # Bollinger Bands
    bb_mid = indicators.get("bb_middle")
    if bb_mid is not None:
        score += 1 if close > bb_mid else -1

    # VWAP
    vwap = indicators.get("vwap")
    if vwap is not None:
        score += 1 if close > vwap else -1

    if score >= 3:
        return "BULLISH"
    elif score <= -3:
        return "BEARISH"
    return "NEUTRAL"


# ======================================================================
# Private helpers
# ======================================================================

def _last(series: pd.Series) -> Optional[float]:
    """Return the last non-NaN value in a Series, or None."""
    if series is None or series.empty:
        return None
    last_valid = series.dropna()
    if last_valid.empty:
        return None
    return float(last_valid.iloc[-1])


def _cluster_levels(levels: list[float], pct: float = 0.005) -> list[float]:
    """Merge price levels that are within *pct* of each other."""
    if not levels:
        return []
    levels = sorted(levels)
    clustered: list[list[float]] = [[levels[0]]]
    for lvl in levels[1:]:
        if abs(lvl - clustered[-1][-1]) / clustered[-1][-1] <= pct:
            clustered[-1].append(lvl)
        else:
            clustered.append([lvl])
    return [float(np.mean(c)) for c in clustered]
