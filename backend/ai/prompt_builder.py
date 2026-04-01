from typing import Any, Dict, List, Optional


def build_analysis_prompt(
    symbol: str,
    current_price: float,
    indicators: Dict[str, Any],
    open_positions: List[Dict[str, Any]],
    recent_trades: List[Dict[str, Any]],
    balance: float,
    drawdown_pct: float,
    allow_shorts: bool,
) -> str:
    """Build a structured prompt for AI crypto trading analysis."""

    # --- Role ---
    role_section = (
        "You are an elite cryptocurrency trading analyst with deep expertise in "
        "technical analysis, risk management, and market microstructure. Your task "
        "is to analyze the data below and produce a precise trading recommendation.\n"
    )

    # --- Market data ---
    market_section = (
        f"=== MARKET DATA ===\n"
        f"Symbol: {symbol}\n"
        f"Current Price: {current_price}\n"
    )

    # --- Technical indicators table ---
    indicator_lines = ["=== TECHNICAL INDICATORS ==="]
    indicator_lines.append(f"{'Indicator':<30} {'Value'}")
    indicator_lines.append("-" * 50)
    for key, value in indicators.items():
        if isinstance(value, float):
            indicator_lines.append(f"{key:<30} {value:.6f}")
        else:
            indicator_lines.append(f"{key:<30} {value}")
    indicators_section = "\n".join(indicator_lines) + "\n"

    # --- Support / Resistance from indicators ---
    sr_lines = ["=== SUPPORT & RESISTANCE LEVELS ==="]
    sr_keys = [
        "support_1", "support_2", "support_3",
        "resistance_1", "resistance_2", "resistance_3",
        "pivot", "pivot_support_1", "pivot_support_2",
        "pivot_resistance_1", "pivot_resistance_2",
        "bollinger_lower", "bollinger_upper",
    ]
    found_sr = False
    for k in sr_keys:
        if k in indicators and indicators[k] is not None:
            sr_lines.append(f"  {k}: {indicators[k]}")
            found_sr = True
    if not found_sr:
        sr_lines.append("  (No explicit S/R levels provided; derive from indicators.)")
    sr_section = "\n".join(sr_lines) + "\n"

    # --- Open positions ---
    if open_positions:
        pos_lines = ["=== OPEN POSITIONS ==="]
        for p in open_positions:
            pos_lines.append(
                f"  Side: {p.get('side', 'N/A')} | Entry: {p.get('entry_price', 'N/A')} | "
                f"Qty: {p.get('quantity', 'N/A')} | PnL: {p.get('pnl', 'N/A')}"
            )
        positions_section = "\n".join(pos_lines) + "\n"
    else:
        positions_section = "=== OPEN POSITIONS ===\nNo open positions.\n"

    # --- Recent trades (last 5) ---
    last_trades = recent_trades[-5:] if recent_trades else []
    if last_trades:
        trades_lines = ["=== LAST 5 TRADE RESULTS ==="]
        for t in last_trades:
            trades_lines.append(
                f"  {t.get('side', 'N/A')} | Entry: {t.get('entry_price', 'N/A')} | "
                f"Exit: {t.get('exit_price', 'N/A')} | PnL: {t.get('pnl', 'N/A')} | "
                f"PnL%: {t.get('pnl_pct', 'N/A')}"
            )
        trades_section = "\n".join(trades_lines) + "\n"
    else:
        trades_section = "=== LAST 5 TRADE RESULTS ===\nNo recent trades.\n"

    # --- Account info ---
    account_section = (
        f"=== ACCOUNT STATUS ===\n"
        f"Balance: {balance:.2f} USDT\n"
        f"Current Drawdown: {drawdown_pct:.2f}%\n"
    )

    # --- Trading rules ---
    shorts_rule = (
        "Short selling is ALLOWED." if allow_shorts
        else "Short selling is NOT allowed. Only recommend BUY or HOLD."
    )

    rules_section = (
        "=== RISK MANAGEMENT RULES ===\n"
        f"- {shorts_rule}\n"
        "- Minimum Risk-to-Reward Ratio: 1:1.05 (reward must exceed risk).\n"
        "- Maximum risk per trade: 1% of account balance.\n"
        "- If drawdown exceeds 10%, be more conservative (prefer HOLD).\n"
        "- Always set a stop-loss. Never recommend a trade without one.\n"
        "- Take-profit levels should be tiered (TP1 conservative, TP2 moderate, TP3 aggressive).\n"
        "- Consider recent trade history: avoid revenge trading after losses.\n"
        "- You MUST choose a leverage between 1 and 10 for each trade.\n"
        "- Scale leverage with confidence: low confidence (70-80%) = 1-3x, medium (80-90%) = 3-5x, high (90%+) = 5-10x.\n"
        "- Higher leverage = higher risk. Be conservative with leverage when drawdown is high.\n"
    )

    # --- Response format ---
    response_section = (
        "=== RESPONSE FORMAT ===\n"
        "Respond with ONLY valid JSON matching this exact schema (no extra keys, no markdown):\n"
        "{\n"
        '  "action": "BUY" | "SELL" | "HOLD",\n'
        '  "confidence": <integer 0-100>,\n'
        '  "entry_price": <float>,\n'
        '  "stop_loss": <float>,\n'
        '  "take_profit_1": <float>,\n'
        '  "take_profit_2": <float>,\n'
        '  "take_profit_3": <float>,\n'
        '  "leverage": <integer 1-10>,\n'
        '  "reasoning": "<concise explanation of your analysis>"\n'
        "}\n\n"
        "If the recommendation is HOLD, set entry_price, stop_loss, and take_profit "
        "fields to the current price.\n"
        "Confidence should reflect how strongly the indicators align. Below 50 means "
        "weak/unclear signal.\n"
    )

    prompt = "\n".join([
        role_section,
        market_section,
        indicators_section,
        sr_section,
        positions_section,
        trades_section,
        account_section,
        rules_section,
        response_section,
    ])

    return prompt
