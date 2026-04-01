import json
import logging
import re
from typing import Optional

from schemas import Signal

logger = logging.getLogger(__name__)

REQUIRED_FIELDS = [
    "action",
    "confidence",
    "entry_price",
    "stop_loss",
    "take_profit_1",
    "take_profit_2",
    "take_profit_3",
    "reasoning",
]


def _extract_json(text: str) -> Optional[dict]:
    """Try to extract a JSON object from text that may contain markdown or preamble."""
    # Try 1: raw JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try 2: extract from markdown code block (```json ... ``` or ``` ... ```)
    pattern = r"```(?:json)?\s*(\{.*?\})\s*```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Try 3: find first { ... } substring
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start : brace_end + 1])
        except json.JSONDecodeError:
            pass

    return None


def parse_ai_response(response_text: str, current_price: float) -> Optional[Signal]:
    """Parse raw AI response text into a validated Signal, or None on failure."""
    if not response_text or not response_text.strip():
        logger.warning("Empty AI response received")
        return None

    data = _extract_json(response_text)
    if data is None:
        logger.warning("Could not extract JSON from AI response: %s", response_text[:200])
        return None

    # --- Validate required fields ---
    missing = [f for f in REQUIRED_FIELDS if f not in data]
    if missing:
        logger.warning("AI response missing required fields: %s", missing)
        return None

    # --- Validate action ---
    action = str(data["action"]).upper()
    if action not in ("BUY", "SELL", "HOLD"):
        logger.warning("Invalid action in AI response: %s", data["action"])
        return None

    # --- Validate confidence ---
    try:
        confidence = int(data["confidence"])
    except (ValueError, TypeError):
        logger.warning("Invalid confidence value: %s", data["confidence"])
        return None
    if confidence < 0 or confidence > 100:
        logger.warning("Confidence out of range (0-100): %d", confidence)
        return None

    # --- Validate prices ---
    try:
        entry_price = float(data["entry_price"])
        stop_loss = float(data["stop_loss"])
        tp1 = float(data["take_profit_1"])
        tp2 = float(data["take_profit_2"])
        tp3 = float(data["take_profit_3"])
    except (ValueError, TypeError) as e:
        logger.warning("Invalid price value in AI response: %s", e)
        return None

    # For non-HOLD actions, check price reasonableness
    if action != "HOLD":
        max_deviation = 0.30  # 30% - crypto is highly volatile
        price_lower = current_price * (1 - max_deviation)
        price_upper = current_price * (1 + max_deviation)

        if not (price_lower <= entry_price <= price_upper):
            logger.warning(
                "Entry price %.2f is >20%% away from current price %.2f",
                entry_price,
                current_price,
            )
            return None

        if not (price_lower <= stop_loss <= price_upper):
            logger.warning(
                "Stop loss %.2f is >20%% away from current price %.2f",
                stop_loss,
                current_price,
            )
            return None

        # Take-profits can be further out (up to 80% for aggressive TP3)
        tp_upper = current_price * 1.80
        tp_lower = current_price * 0.20
        for label, tp_val in [("TP1", tp1), ("TP2", tp2), ("TP3", tp3)]:
            if not (tp_lower <= tp_val <= tp_upper):
                logger.warning(
                    "%s price %.2f is unreasonably far from current price %.2f",
                    label,
                    tp_val,
                    current_price,
                )
                return None

    reasoning = str(data.get("reasoning", ""))

    # Parse leverage (AI-determined, 1-10, default based on confidence)
    try:
        leverage = int(data.get("leverage", 1))
        leverage = max(1, min(10, leverage))
    except (ValueError, TypeError):
        # Fallback: scale leverage from confidence
        if confidence >= 90:
            leverage = 5
        elif confidence >= 80:
            leverage = 3
        else:
            leverage = 1

    try:
        signal = Signal(
            action=action,
            confidence=confidence,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit_1=tp1,
            take_profit_2=tp2,
            take_profit_3=tp3,
            leverage=leverage,
            reasoning=reasoning,
        )
        return signal
    except Exception as e:
        logger.warning("Failed to construct Signal: %s", e)
        return None
