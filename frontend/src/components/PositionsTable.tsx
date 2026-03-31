import React from "react";
import { usePositions } from "../api/hooks";
import { useBotStore } from "../store/useBotStore";
import type { Trade } from "../types/index";

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

function formatPnl(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatPnlPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
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
  tpCheck: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    borderRadius: "50%",
    fontSize: 11,
    fontWeight: 700,
    marginLeft: 4,
  },
  placeholder: {
    textAlign: "center" as const,
    padding: 40,
    color: "#64748b",
    fontSize: 15,
  },
};

function TpCell({
  price,
  filled,
}: {
  price: number | null;
  filled: boolean;
}) {
  if (price == null) return <span style={{ color: "#475569" }}>-</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {formatPrice(price)}
      {filled && (
        <span
          style={{
            ...styles.tpCheck,
            background: "rgba(34, 197, 94, 0.15)",
            color: "#22c55e",
          }}
        >
          {"\u2713"}
        </span>
      )}
    </span>
  );
}

function PositionRow({ trade }: { trade: Trade }) {
  const currentPrice = useBotStore((s) => s.currentPrice);

  const liveCurrent = currentPrice ?? trade.entry_price;
  const isLong = trade.side.toUpperCase() === "LONG" || trade.side.toUpperCase() === "BUY";

  const livePnl = isLong
    ? (liveCurrent - trade.entry_price) * trade.quantity
    : (trade.entry_price - liveCurrent) * trade.quantity;

  const livePnlPct =
    trade.entry_price > 0
      ? ((isLong ? liveCurrent - trade.entry_price : trade.entry_price - liveCurrent) /
          trade.entry_price) *
        100
      : 0;

  const pnlColor = livePnl >= 0 ? "#22c55e" : "#ef4444";

  const sideLabel = isLong ? "LONG" : "SHORT";
  const sideBg = isLong
    ? "rgba(34, 197, 94, 0.12)"
    : "rgba(239, 68, 68, 0.12)";
  const sideColor = isLong ? "#22c55e" : "#ef4444";

  const [hovered, setHovered] = React.useState(false);

  return (
    <tr
      style={{
        ...styles.row,
        background: hovered ? "rgba(59, 130, 246, 0.05)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
      <td style={styles.td}>
        <span style={{ fontWeight: 600, color: "#f1f5f9" }}>
          {formatPrice(liveCurrent)}
        </span>
      </td>
      <td style={styles.td}>{trade.quantity.toFixed(4)}</td>
      <td style={{ ...styles.td, color: "#ef4444" }}>
        {formatPrice(trade.stop_loss)}
      </td>
      <td style={styles.td}>
        <TpCell price={trade.tp1_price} filled={trade.tp1_filled} />
      </td>
      <td style={styles.td}>
        <TpCell price={trade.tp2_price} filled={trade.tp2_filled} />
      </td>
      <td style={styles.td}>
        <TpCell price={trade.tp3_price} filled={trade.tp3_filled} />
      </td>
      <td style={{ ...styles.td, color: pnlColor, fontWeight: 700 }}>
        {formatPnl(livePnl)} USDT
      </td>
      <td style={{ ...styles.td, color: pnlColor, fontWeight: 600 }}>
        {formatPnlPct(livePnlPct)}
      </td>
      <td style={styles.td}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 8px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            background: "rgba(59, 130, 246, 0.12)",
            color: "#3b82f6",
          }}
        >
          {trade.status}
        </span>
      </td>
    </tr>
  );
}

export default function PositionsTable() {
  const { data: positions, isLoading } = usePositions();

  const hasPositions = positions && positions.length > 0;

  return (
    <div style={styles.container}>
      <div style={styles.title}>
        Offene Positionen
        {hasPositions && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#64748b",
              marginLeft: 8,
            }}
          >
            ({positions.length})
          </span>
        )}
      </div>

      {isLoading && (
        <div style={styles.placeholder}>Lade Positionen...</div>
      )}

      {!isLoading && !hasPositions && (
        <div style={styles.placeholder}>Keine offenen Positionen</div>
      )}

      {hasPositions && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Symbol</th>
              <th style={styles.th}>Seite</th>
              <th style={styles.th}>Einstieg</th>
              <th style={styles.th}>Aktuell</th>
              <th style={styles.th}>Menge</th>
              <th style={styles.th}>SL</th>
              <th style={styles.th}>TP1</th>
              <th style={styles.th}>TP2</th>
              <th style={styles.th}>TP3</th>
              <th style={styles.th}>P&amp;L</th>
              <th style={styles.th}>P&amp;L%</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((trade) => (
              <PositionRow key={trade.id} trade={trade} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
