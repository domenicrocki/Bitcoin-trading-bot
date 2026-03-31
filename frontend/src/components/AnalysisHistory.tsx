import React, { useState } from "react";
import { useJournal } from "../api/hooks";
import type { AnalysisEntry } from "../types/index";

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  BUY: { bg: "rgba(34, 197, 94, 0.12)", color: "#22c55e" },
  SELL: { bg: "rgba(239, 68, 68, 0.12)", color: "#ef4444" },
  HOLD: { bg: "rgba(245, 158, 11, 0.12)", color: "#f59e0b" },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #1a1d29 0%, #12141c 100%)",
    border: "1px solid #2a2d3a",
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
    borderBottom: "1px solid #2a2d3a",
    background: "rgba(15, 17, 23, 0.5)",
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(42, 45, 58, 0.5)",
    color: "#94a3b8",
    whiteSpace: "nowrap" as const,
  },
  row: {
    transition: "background 0.15s",
  },
  badge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 16,
    fontSize: 13,
    color: "#94a3b8",
  },
  pageBtn: {
    padding: "6px 14px",
    background: "rgba(59, 130, 246, 0.1)",
    border: "1px solid rgba(59, 130, 246, 0.25)",
    borderRadius: 6,
    color: "#3b82f6",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  pageBtnDisabled: {
    padding: "6px 14px",
    background: "rgba(100, 116, 139, 0.08)",
    border: "1px solid rgba(100, 116, 139, 0.15)",
    borderRadius: 6,
    color: "#475569",
    cursor: "not-allowed",
    fontSize: 12,
    fontWeight: 600,
  },
  placeholder: {
    textAlign: "center" as const,
    padding: 40,
    color: "#64748b",
    fontSize: 15,
  },
  riskPassed: {
    color: "#22c55e",
    fontWeight: 600,
  },
  riskFailed: {
    color: "#ef4444",
    fontWeight: 600,
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return "-";
  if (price >= 1000)
    return price.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return price.toFixed(4);
}

const PAGE_SIZE = 10;

export default function AnalysisHistory() {
  const [page, setPage] = useState(0);
  const { data: entries, isLoading } = useJournal(PAGE_SIZE, page * PAGE_SIZE);

  const hasEntries = entries && entries.length > 0;

  return (
    <div style={styles.container}>
      <div style={styles.title}>
        Analysehistorie
        {hasEntries && (
          <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b", marginLeft: 8 }}>
            (Seite {page + 1})
          </span>
        )}
      </div>

      {isLoading && <div style={styles.placeholder}>Lade Analysen...</div>}

      {!isLoading && !hasEntries && (
        <div style={styles.placeholder}>Noch keine Analysen durchgeführt</div>
      )}

      {hasEntries && (
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Datum</th>
                <th style={styles.th}>Symbol</th>
                <th style={styles.th}>Preis</th>
                <th style={styles.th}>KI</th>
                <th style={styles.th}>Signal</th>
                <th style={styles.th}>Konfidenz</th>
                <th style={styles.th}>Risiko-Check</th>
                <th style={styles.th}>Grund</th>
                <th style={styles.th}>Trade</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry: AnalysisEntry) => {
                const action = entry.parsed_action?.toUpperCase() ?? "—";
                const actionStyle = ACTION_COLORS[action] ?? { bg: "rgba(100,116,139,0.1)", color: "#64748b" };
                const [hovered, setHovered] = React.useState(false);

                return (
                  <tr
                    key={entry.id}
                    style={{
                      ...styles.row,
                      background: hovered ? "rgba(59, 130, 246, 0.04)" : "transparent",
                    }}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                  >
                    <td style={styles.td}>{formatDate(entry.timestamp)}</td>
                    <td style={{ ...styles.td, fontWeight: 600, color: "#f1f5f9" }}>{entry.symbol}</td>
                    <td style={{ ...styles.td, fontFamily: "'JetBrains Mono', monospace" }}>
                      ${formatPrice(entry.price_at_analysis)}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          background: "rgba(139, 92, 246, 0.12)",
                          color: "#a78bfa",
                        }}
                      >
                        {entry.ai_provider}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          background: actionStyle.bg,
                          color: actionStyle.color,
                        }}
                      >
                        {action}
                      </span>
                    </td>
                    <td style={{ ...styles.td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                      {entry.confidence != null ? `${entry.confidence}%` : "-"}
                    </td>
                    <td style={styles.td}>
                      {entry.risk_check_passed === true && (
                        <span style={styles.riskPassed}>Bestanden</span>
                      )}
                      {entry.risk_check_passed === false && (
                        <span style={styles.riskFailed}>Abgelehnt</span>
                      )}
                      {entry.risk_check_passed == null && <span style={{ color: "#475569" }}>—</span>}
                    </td>
                    <td style={{ ...styles.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.risk_check_reason ?? "-"}
                    </td>
                    <td style={styles.td}>
                      {entry.trade_id ? (
                        <span style={{ color: "#22c55e", fontWeight: 600 }}>#{entry.trade_id}</span>
                      ) : (
                        <span style={{ color: "#475569" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={styles.pagination}>
        <button
          style={page === 0 ? styles.pageBtnDisabled : styles.pageBtn}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          Zurück
        </button>
        <span>Seite {page + 1}</span>
        <button
          style={!hasEntries || entries.length < PAGE_SIZE ? styles.pageBtnDisabled : styles.pageBtn}
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasEntries || entries.length < PAGE_SIZE}
        >
          Weiter
        </button>
      </div>
    </div>
  );
}
