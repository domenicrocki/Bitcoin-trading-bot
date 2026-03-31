import React, { useState } from "react";
import { useTrades } from "../api/hooks";
import type { Trade } from "../types/index";

const PAGE_SIZE = 10;

const AI_PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Claude",
};

function formatPrice(price: number | null | undefined): string {
  if (price == null) return "-";
  if (price >= 1000)
    return price.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return "-";
  try {
    const d = new Date(ts);
    return d.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #1a1d29 0%, #12141c 100%)",
    border: "1px solid #2a2d3a",
    borderRadius: 12,
    padding: 24,
    color: "#e2e8f0",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    width: "100%",
    overflowX: "auto",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: "#f1f5f9",
    marginBottom: 20,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    padding: "10px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    borderBottom: "1px solid #1e2130",
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "12px 12px",
    borderBottom: "1px solid #1e2130",
    whiteSpace: "nowrap" as const,
    verticalAlign: "middle" as const,
  },
  row: {
    transition: "background 0.15s",
  },
  sideBadge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  pageBtn: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "1px solid #2a2d3a",
    background: "#0f1117",
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  pageBtnDisabled: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "1px solid #1e2130",
    background: "#0f1117",
    color: "#374151",
    fontSize: 13,
    fontWeight: 600,
    cursor: "not-allowed",
  },
  pageInfo: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: 500,
  },
  placeholder: {
    textAlign: "center" as const,
    padding: 40,
    color: "#64748b",
    fontSize: 15,
  },
};

function TradeRow({ trade }: { trade: Trade }) {
  const [hovered, setHovered] = useState(false);

  const isLong =
    trade.side.toUpperCase() === "LONG" || trade.side.toUpperCase() === "BUY";
  const sideLabel = isLong ? "LONG" : "SHORT";
  const sideBg = isLong
    ? "rgba(34, 197, 94, 0.12)"
    : "rgba(239, 68, 68, 0.12)";
  const sideColor = isLong ? "#22c55e" : "#ef4444";

  const pnl = trade.pnl ?? 0;
  const pnlPct = trade.pnl_pct ?? 0;
  const pnlColor = pnl >= 0 ? "#22c55e" : "#ef4444";

  return (
    <tr
      style={{
        ...styles.row,
        background: hovered ? "rgba(59, 130, 246, 0.05)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={{ ...styles.td, color: "#64748b" }}>#{trade.id}</td>
      <td style={styles.td}>
        <span style={{ fontWeight: 600, color: "#f1f5f9" }}>
          {trade.symbol}
        </span>
      </td>
      <td style={styles.td}>
        <span
          style={{
            ...styles.sideBadge,
            background: sideBg,
            color: sideColor,
          }}
        >
          {sideLabel}
        </span>
      </td>
      <td style={styles.td}>{formatPrice(trade.entry_price)}</td>
      <td style={styles.td}>{formatPrice(trade.exit_price)}</td>
      <td style={{ ...styles.td, color: pnlColor, fontWeight: 700 }}>
        {pnl >= 0 ? "+" : ""}
        {pnl.toFixed(2)} USDT
      </td>
      <td style={{ ...styles.td, color: pnlColor, fontWeight: 600 }}>
        {pnlPct >= 0 ? "+" : ""}
        {pnlPct.toFixed(2)}%
      </td>
      <td style={styles.td}>
        {trade.ai_provider ? (
          <span
            style={{
              display: "inline-block",
              padding: "3px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: "rgba(139, 92, 246, 0.12)",
              color: "#a78bfa",
            }}
          >
            {AI_PROVIDER_LABELS[trade.ai_provider] ?? trade.ai_provider}
          </span>
        ) : (
          <span style={{ color: "#475569" }}>-</span>
        )}
      </td>
      <td style={styles.td}>
        {trade.ai_confidence != null ? (
          <span style={{ fontWeight: 600 }}>{trade.ai_confidence.toFixed(0)}%</span>
        ) : (
          <span style={{ color: "#475569" }}>-</span>
        )}
      </td>
      <td style={{ ...styles.td, color: "#94a3b8" }}>
        {formatDate(trade.closed_at)}
      </td>
    </tr>
  );
}

export default function TradeHistory() {
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;

  const { data: trades, isLoading } = useTrades(PAGE_SIZE, offset);

  const hasTrades = trades && trades.length > 0;
  const hasNext = trades && trades.length === PAGE_SIZE;
  const hasPrev = page > 0;

  return (
    <div style={styles.container}>
      <div style={styles.title}>Handelshistorie</div>

      {isLoading && (
        <div style={styles.placeholder}>Lade Trades...</div>
      )}

      {!isLoading && !hasTrades && page === 0 && (
        <div style={styles.placeholder}>
          Noch keine abgeschlossenen Trades
        </div>
      )}

      {!isLoading && !hasTrades && page > 0 && (
        <div style={styles.placeholder}>Keine weiteren Trades</div>
      )}

      {hasTrades && (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Symbol</th>
                <th style={styles.th}>Seite</th>
                <th style={styles.th}>Einstieg</th>
                <th style={styles.th}>Ausstieg</th>
                <th style={styles.th}>P&amp;L</th>
                <th style={styles.th}>P&amp;L%</th>
                <th style={styles.th}>KI-Anbieter</th>
                <th style={styles.th}>Konfidenz</th>
                <th style={styles.th}>Datum</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </tbody>
          </table>

          <div style={styles.pagination}>
            <button
              type="button"
              style={hasPrev ? styles.pageBtn : styles.pageBtnDisabled}
              disabled={!hasPrev}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              onMouseEnter={(e) => {
                if (hasPrev)
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "#3b82f6";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#2a2d3a";
              }}
            >
              {"\u2190"} Zur\u00FCck
            </button>
            <span style={styles.pageInfo}>Seite {page + 1}</span>
            <button
              type="button"
              style={hasNext ? styles.pageBtn : styles.pageBtnDisabled}
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              onMouseEnter={(e) => {
                if (hasNext)
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "#3b82f6";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#2a2d3a";
              }}
            >
              Weiter {"\u2192"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
