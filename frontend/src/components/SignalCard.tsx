import React from "react";
import { useLatestAnalysis } from "../api/hooks";
import { useBotStore } from "../store/useBotStore";
import type { AnalysisEntry } from "../types/index";

const AI_PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Claude",
};

const ACTION_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; icon: string; label: string }
> = {
  BUY: {
    color: "#22c55e",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.4)",
    icon: "\u2191",
    label: "LONG",
  },
  SELL: {
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.4)",
    icon: "\u2193",
    label: "SHORT",
  },
  HOLD: {
    color: "#94a3b8",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.3)",
    icon: "\u2194",
    label: "HOLD",
  },
};

function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return "#22c55e";
  if (confidence >= 65) return "#eab308";
  return "#ef4444";
}

function getConfidenceGradient(_confidence: number): string {
  return `linear-gradient(90deg, #ef4444 0%, #eab308 50%, #22c55e 100%)`;
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return "-";
  if (price >= 1000) return price.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "-";
  try {
    const d = new Date(ts);
    return d.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "linear-gradient(135deg, #1a1d29 0%, #12141c 100%)",
    borderRadius: 12,
    padding: 24,
    color: "#e2e8f0",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    width: "100%",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: "#f1f5f9",
    marginBottom: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 28px",
    borderRadius: 12,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: 2,
    textAlign: "center" as const,
  },
  confidenceBar: {
    height: 8,
    borderRadius: 4,
    background: "#1e2130",
    overflow: "hidden",
    marginTop: 6,
    marginBottom: 4,
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: 600,
    textAlign: "right" as const,
  },
  priceGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 16,
  },
  priceItem: {
    background: "#0f1117",
    borderRadius: 8,
    padding: "10px 14px",
    border: "1px solid #1e2130",
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: 700,
    color: "#f1f5f9",
  },
  reasoning: {
    background: "#0f1117",
    border: "1px solid #1e2130",
    borderRadius: 8,
    padding: 14,
    marginTop: 16,
    fontSize: 13,
    lineHeight: 1.6,
    color: "#94a3b8",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap" as const,
  },
  badge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
  },
  placeholder: {
    textAlign: "center" as const,
    padding: 40,
    color: "#64748b",
    fontSize: 15,
  },
};

export default function SignalCard() {
  const { data: analyses } = useLatestAnalysis();
  const lastSignal = useBotStore((s) => s.lastSignal);

  const latest: AnalysisEntry | null =
    analyses ?? null;

  const action = latest?.parsed_action?.toUpperCase() ?? lastSignal?.action ?? null;
  const confidence = latest?.confidence ?? lastSignal?.confidence ?? null;
  const entryPrice = latest?.price_at_analysis ?? lastSignal?.entry_price ?? null;
  const stopLoss = lastSignal?.stop_loss ?? null;
  const tp1 = lastSignal?.take_profit_1 ?? null;
  const tp2 = lastSignal?.take_profit_2 ?? null;
  const tp3 = lastSignal?.take_profit_3 ?? null;
  const reasoning = latest?.ai_reasoning ?? lastSignal?.reasoning ?? null;
  const provider = latest?.ai_provider ?? null;
  const symbol = latest?.symbol ?? null;
  const timestamp = latest?.timestamp ?? null;

  const hasSignal = action && (action === "BUY" || action === "SELL" || action === "HOLD");

  const cfg = hasSignal ? ACTION_CONFIG[action] ?? ACTION_CONFIG.HOLD : ACTION_CONFIG.HOLD;

  const borderStyle = hasSignal
    ? `1px solid ${cfg.border}`
    : "1px solid #2a2d3a";

  if (!hasSignal) {
    return (
      <div style={{ ...styles.card, border: borderStyle }}>
        <div style={styles.title}>Letztes KI-Signal</div>
        <div style={styles.placeholder}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>
            {"\u23F3"}
          </div>
          <div>Warte auf Signal...</div>
        </div>
      </div>
    );
  }

  const riskReward =
    entryPrice && stopLoss && tp1
      ? Math.abs(tp1 - entryPrice) / Math.abs(entryPrice - stopLoss)
      : null;

  return (
    <div style={{ ...styles.card, border: borderStyle }}>
      <div style={styles.title}>
        <span>Letztes KI-Signal</span>
        {symbol && (
          <span
            style={{
              ...styles.badge,
              background: "rgba(59, 130, 246, 0.15)",
              color: "#3b82f6",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {symbol}
          </span>
        )}
      </div>

      {/* Action Badge */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div
          style={{
            ...styles.actionBadge,
            color: cfg.color,
            background: cfg.bg,
            border: `2px solid ${cfg.border}`,
            display: "inline-flex",
          }}
        >
          <span style={{ fontSize: 32 }}>{cfg.icon}</span>
          {cfg.label}
        </div>
      </div>

      {/* Confidence */}
      {confidence != null && (
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
              KONFIDENZ
            </span>
            <span
              style={{
                ...styles.confidenceText,
                color: getConfidenceColor(confidence),
              }}
            >
              {confidence.toFixed(0)}%
            </span>
          </div>
          <div style={styles.confidenceBar}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, confidence)}%`,
                borderRadius: 4,
                background: getConfidenceGradient(confidence),
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Price Levels */}
      <div style={styles.priceGrid}>
        {entryPrice != null && (
          <div style={styles.priceItem}>
            <div style={styles.priceLabel}>Einstieg</div>
            <div style={styles.priceValue}>{formatPrice(entryPrice)}</div>
          </div>
        )}
        {stopLoss != null && (
          <div style={{ ...styles.priceItem, borderColor: "rgba(239, 68, 68, 0.25)" }}>
            <div style={{ ...styles.priceLabel, color: "#ef4444" }}>Stop Loss</div>
            <div style={{ ...styles.priceValue, color: "#ef4444" }}>
              {formatPrice(stopLoss)}
            </div>
          </div>
        )}
        {tp1 != null && (
          <div style={{ ...styles.priceItem, borderColor: "rgba(34, 197, 94, 0.2)" }}>
            <div style={{ ...styles.priceLabel, color: "#22c55e" }}>TP1</div>
            <div style={{ ...styles.priceValue, color: "#22c55e" }}>
              {formatPrice(tp1)}
            </div>
          </div>
        )}
        {tp2 != null && (
          <div style={{ ...styles.priceItem, borderColor: "rgba(34, 197, 94, 0.2)" }}>
            <div style={{ ...styles.priceLabel, color: "#22c55e" }}>TP2</div>
            <div style={{ ...styles.priceValue, color: "#22c55e" }}>
              {formatPrice(tp2)}
            </div>
          </div>
        )}
        {tp3 != null && (
          <div style={{ ...styles.priceItem, borderColor: "rgba(34, 197, 94, 0.2)" }}>
            <div style={{ ...styles.priceLabel, color: "#22c55e" }}>TP3</div>
            <div style={{ ...styles.priceValue, color: "#22c55e" }}>
              {formatPrice(tp3)}
            </div>
          </div>
        )}
        {riskReward != null && (
          <div style={styles.priceItem}>
            <div style={styles.priceLabel}>Risk / Reward</div>
            <div
              style={{
                ...styles.priceValue,
                color: riskReward >= 1.05 ? "#22c55e" : riskReward >= 1 ? "#eab308" : "#ef4444",
              }}
            >
              1 : {riskReward.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {/* Reasoning */}
      {reasoning && (
        <div style={styles.reasoning}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            KI-Begründung
          </div>
          {reasoning}
        </div>
      )}

      {/* Meta row */}
      <div style={styles.metaRow}>
        {provider && (
          <span
            style={{
              ...styles.badge,
              background: "rgba(139, 92, 246, 0.15)",
              color: "#a78bfa",
            }}
          >
            {AI_PROVIDER_LABELS[provider] ?? provider}
          </span>
        )}
        {timestamp && (
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {formatTimestamp(timestamp)}
          </span>
        )}
      </div>
    </div>
  );
}
