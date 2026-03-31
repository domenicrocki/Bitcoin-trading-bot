"""Technical analysis module using pandas and pandas_ta.

Computes a comprehensive set of indicators from OHLCV data and provides
helper functions for support/resistance detection and trend classification.
"""

import logging
from typing import Optional

import numpy as np
import pandas as pd
import pandas_ta as ta

logger = logging.getLogger(__name__)


def compute_indicators(df: pd.DataFrame) -> dict:
    """Compute all technical indicators and return the latest values.

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame with columns: open, high, low, close, volume.
        Must contain enough rows for the longest look-back period (>= 200).

    Returns
    -------
    dict  with the latest value for every computed indicator.
    """
    if df.empty:
        raise ValueError("DataFrame is empty; cannot compute indicators.")

    results: dict = {}

    # ------------------------------------------------------------------
    # RSI (14)
    # ------------------------------------------------------------------
    rsi = ta.rsi(df["close"], length=14)
    if rsi is not None and not rsi.empty:
        results["rsi_14"] = _last(rsi)

    # ------------------------------------------------------------------
    # MACD (12, 26, 9)
    # ------------------------------------------------------------------
    macd = ta.macd(df["close"], fast=12, slow=26, signal=9)
    if macd is not None and not macd.empty:
        results["macd_line"] = _last(macd.iloc[:, 0])
        results["macd_signal"] = _last(macd.iloc[:, 1])
        results["macd_histogram"] = _last(macd.iloc[:, 2])

    # ------------------------------------------------------------------
    # Bollinger Bands (20, 2)
    # ------------------------------------------------------------------
    bbands = ta.bbands(df["close"], length=20, std=2)
    if bbands is not None and not bbands.empty:
        results["bb_lower"] = _last(bbands.iloc[:, 0])
        results["bb_middle"] = _last(bbands.iloc[:, 1])
        results["bb_upper"] = _last(bbands.iloc[:, 2])
        results["bb_bandwidth"] = _last(bbands.iloc[:, 3]) if bbands.shape[1] > 3 else None
        results["bb_percent"] = _last(bbands.iloc[:, 4]) if bbands.shape[1] > 4 else None

    # ------------------------------------------------------------------
    # EMA (9, 21, 50, 200)
    # ------------------------------------------------------------------
    for period in (9, 21, 50, 200):
        ema = ta.ema(df["close"], length=period)
        if ema is not None and not ema.empty:
            results[f"ema_{period}"] = _last(ema)

    # ------------------------------------------------------------------
    # SMA (20, 50, 200)
    # ------------------------------------------------------------------
    for period in (20, 50, 200):
        sma = ta.sma(df["close"], length=period)
        if sma is not None and not sma.empty:
            results[f"sma_{period}"] = _last(sma)

    # ------------------------------------------------------------------
    # Stochastic RSI (14)
    # ------------------------------------------------------------------
    stoch_rsi = ta.stochrsi(df["close"], length=14)
    if stoch_rsi is not None and not stoch_rsi.empty:
        results["stoch_rsi_k"] = _last(stoch_rsi.iloc[:, 0])
        results["stoch_rsi_d"] = _last(stoch_rsi.iloc[:, 1])

    # ------------------------------------------------------------------
    # ADX (14)
    # ------------------------------------------------------------------
    adx = ta.adx(df["high"], df["low"], df["close"], length=14)
    if adx is not None and not adx.empty:
        results["adx_14"] = _last(adx.iloc[:, 0])
        results["plus_di"] = _last(adx.iloc[:, 1])
        results["minus_di"] = _last(adx.iloc[:, 2])

    # ------------------------------------------------------------------
    # ATR (14)
    # ------------------------------------------------------------------
    atr = ta.atr(df["high"], df["low"], df["close"], length=14)
    if atr is not None and not atr.empty:
        results["atr_14"] = _last(atr)

    # ------------------------------------------------------------------
    # OBV
    # ------------------------------------------------------------------
    obv = ta.obv(df["close"], df["volume"])
    if obv is not None and not obv.empty:
        results["obv"] = _last(obv)

    # ------------------------------------------------------------------
    # VWAP
    # ------------------------------------------------------------------
    vwap = ta.vwap(df["high"], df["low"], df["close"], df["volume"])
    if vwap is not None and not vwap.empty:
        results["vwap"] = _last(vwap)

    # Current close price for convenience
    results["close"] = _last(df["close"])

    logger.debug("Computed %d indicators", len(results))
    return results


def get_support_resistance(df: pd.DataFrame, window: int = 20) -> dict:
    """Identify recent support and resistance levels using rolling extremes.

    Parameters
    ----------
    df : pd.DataFrame  OHLCV data.
    window : int  rolling window size.

    Returns
    -------
    dict with keys:
        support  - list of support price levels
        resistance - list of resistance price levels
    """
    if len(df) < window:
        return {"support": [], "resistance": []}

    highs = df["high"].values
    lows = df["low"].values

    resistance_levels: list[float] = []
    support_levels: list[float] = []

    half = window // 2

    for i in range(half, len(highs) - half):
        # Local maximum -> resistance
        if highs[i] == max(highs[i - half : i + half + 1]):
            resistance_levels.append(float(highs[i]))
        # Local minimum -> support
        if lows[i] == min(lows[i - half : i + half + 1]):
            support_levels.append(float(lows[i]))

    # Cluster nearby levels (within 0.5 % of each other) and keep the mean
    support_levels = _cluster_levels(support_levels)
    resistance_levels = _cluster_levels(resistance_levels)

    return {
        "support": sorted(support_levels),
        "resistance": sorted(resistance_levels),
    }


def get_trend_direction(indicators: dict) -> str:
    """Classify the current trend as BULLISH, BEARISH, or NEUTRAL.

    Uses a scoring system across multiple indicator groups:
    - EMA alignment (short above long = bullish)
    - MACD histogram sign
    - RSI zones
    - ADX / DI crossover
    - Price relative to Bollinger middle band
    - Price relative to VWAP
    """
    score = 0
    close = indicators.get("close")

    if close is None:
        return "NEUTRAL"

    # --- EMA alignment ---------------------------------------------------
    ema_9 = indicators.get("ema_9")
    ema_21 = indicators.get("ema_21")
    ema_50 = indicators.get("ema_50")
    ema_200 = indicators.get("ema_200")

    if ema_9 is not None and ema_21 is not None:
        if ema_9 > ema_21:
            score += 1
        else:
            score -= 1

    if ema_50 is not None and ema_200 is not None:
        if ema_50 > ema_200:
            score += 1  # golden cross territory
        else:
            score -= 1  # death cross territory

    if ema_200 is not None:
        if close > ema_200:
            score += 1
        else:
            score -= 1

    # --- MACD ------------------------------------------------------------
    macd_hist = indicators.get("macd_histogram")
    if macd_hist is not None:
        if macd_hist > 0:
            score += 1
        elif macd_hist < 0:
            score -= 1

    macd_line = indicators.get("macd_line")
    macd_signal = indicators.get("macd_signal")
    if macd_line is not None and macd_signal is not None:
        if macd_line > macd_signal:
            score += 1
        else:
            score -= 1

    # --- RSI -------------------------------------------------------------
    rsi = indicators.get("rsi_14")
    if rsi is not None:
        if rsi > 60:
            score += 1
        elif rsi < 40:
            score -= 1

    # --- ADX + DI --------------------------------------------------------
    adx = indicators.get("adx_14")
    plus_di = indicators.get("plus_di")
    minus_di = indicators.get("minus_di")
    if adx is not None and plus_di is not None and minus_di is not None:
        if adx > 25:
            if plus_di > minus_di:
                score += 2
            else:
                score -= 2

    # --- Bollinger Bands -------------------------------------------------
    bb_mid = indicators.get("bb_middle")
    if bb_mid is not None:
        if close > bb_mid:
            score += 1
        else:
            score -= 1

    # --- VWAP ------------------------------------------------------------
    vwap = indicators.get("vwap")
    if vwap is not None:
        if close > vwap:
            score += 1
        else:
            score -= 1

    # --- Classification --------------------------------------------------
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
