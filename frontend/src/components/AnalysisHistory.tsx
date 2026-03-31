import React, { useState } from "react";
import { useJournal } from "../api/hooks";
import type { AnalysisEntry } from "../types/index";

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  BUY: { bg: "rgba(34, 197, 94, 0.12)", color: "#22c55e" },
  SELL: { bg: "rgba(239, 68, 68, 0.12)", color: "#ef4444" },
  HOLD: { bg: "rgba(245, 158, 11, 0.12)", color: "#f59e0b" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return "-";
  if (price >= 1000) return price.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toFixed(4);
}

function extractReasoning(entry: AnalysisEntry): string | null {
  // Try ai_reasoning first, then parse from ai_response JSON
  if (entry.ai_reasoning) return entry.ai_reasoning;
  if (!entry.ai_response) return null;
  try {
    const parsed = JSON.parse(entry.ai_response);
    return parsed.reasoning || null;
  } catch {
    // Try to find reasoning in raw text
    const match = entry.ai_response.match(/"reasoning"\s*:\s*"([^"]+)"/);
    return match ? match[1] : null;
  }
}

const PAGE_SIZE = 10;

export default function AnalysisHistory() {
  const [page, setPage] = useState(0);
  const { data: entries, isLoading } = useJournal(PAGE_SIZE, page * PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const hasEntries = entries && entries.length > 0;

  return (
    <div style={styles.container}>
      <div style={styles.title}>
        Analysehistorie
        {hasEntries && (
          <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b", marginLeft: 8 }}>
            (Seite {page + 1})
          </span>
        )}
      </div>

      {isLoading && <div style={styles.placeholder}>Lade Analysen...</div>}
      {!isLoading && !hasEntries && <div style={styles.placeholder}>Noch keine Analysen</div>}

      {hasEntries && (
        <div>
          {entries.map((entry: AnalysisEntry) => {
            const action = entry.parsed_action?.toUpperCase() ?? "—";
            const actionStyle = ACTION_COLORS[action] ?? { bg: "rgba(100,116,139,0.1)", color: "#64748b" };
            const isExpanded = expandedId === entry.id;
            const reasoning = extractReasoning(entry);

            return (
              <div key={entry.id}>
                {/* Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  style={{
                    ...styles.row,
                    borderLeft: isExpanded ? "3px solid #3b82f6" : "3px solid transparent",
                    background: isExpanded ? "rgba(59, 130, 246, 0.05)" : "transparent",
                  }}
                >
                  <div style={styles.rowLeft}>
                    <span style={styles.date}>{formatDate(entry.timestamp)}</span>
                    <span style={styles.symbol}>{entry.symbol}</span>
                    <span style={styles.price}>${formatPrice(entry.price_at_analysis)}</span>
                    <span style={{ ...styles.badge, background: "rgba(139,92,246,0.12)", color: "#a78bfa" }}>
                      {entry.ai_provider}
                    </span>
                    <span style={{ ...styles.badge, background: actionStyle.bg, color: actionStyle.color }}>
                      {action}
                    </span>
                    <span style={styles.confidence}>
                      {entry.confidence != null ? `${entry.confidence}%` : "-"}
                    </span>
                  </div>
                  <div style={styles.rowRight}>
                    {entry.risk_check_passed === true && <span style={{ color: "#22c55e", fontSize: 11, fontWeight: 600 }}>Bestanden</span>}
                    {entry.risk_check_passed === false && <span style={{ color: "#ef4444", fontSize: 11, fontWeight: 600 }}>Abgelehnt</span>}
                    {entry.trade_id && <span style={{ color: "#3b82f6", fontSize: 11, fontWeight: 600, marginLeft: 6 }}>Trade #{entry.trade_id}</span>}
                    <span style={{ fontSize: 14, color: "#475569", marginLeft: 6 }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={styles.detail}>
                    {/* Risk reason */}
                    {entry.risk_check_reason && (
                      <div style={styles.detailSection}>
                        <div style={styles.detailLabel}>Risiko-Bewertung</div>
                        <div style={{
                          ...styles.detailText,
                          color: entry.risk_check_passed ? "#10b981" : "#ef4444",
                        }}>
                          {entry.risk_check_reason}
                        </div>
                      </div>
                    )}

                    {/* AI Reasoning */}
                    {reasoning && (
                      <div style={styles.detailSection}>
                        <div style={styles.detailLabel}>KI-Begründung</div>
                        <div style={styles.detailText}>{reasoning}</div>
                      </div>
                    )}

                    {/* No reasoning available */}
                    {!reasoning && (
                      <div style={styles.detailSection}>
                        <div style={{ ...styles.detailText, color: "#475569", fontStyle: "italic" }}>
                          Keine KI-Begründung verfügbar
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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

// ── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #1a1d29 0%, #12141c 100%)",
    border: "1px solid #2a2d3a",
    borderRadius: 12,
    padding: 20,
    color: "#e2e8f0",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    width: "100%",
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    color: "#f1f5f9",
    marginBottom: 14,
  },
  placeholder: {
    textAlign: "center" as const,
    padding: 30,
    color: "#64748b",
    fontSize: 14,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 10px",
    borderBottom: "1px solid rgba(42, 45, 58, 0.4)",
    cursor: "pointer",
    transition: "all 0.15s",
    borderRadius: 4,
    gap: 8,
  },
  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
    minWidth: 0,
  },
  rowRight: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  date: {
    fontSize: 11,
    color: "#64748b",
    fontFamily: "'JetBrains Mono', monospace",
    minWidth: 85,
  },
  symbol: {
    fontSize: 12,
    fontWeight: 600,
    color: "#f1f5f9",
  },
  price: {
    fontSize: 12,
    color: "#94a3b8",
    fontFamily: "'JetBrains Mono', monospace",
  },
  badge: {
    display: "inline-block",
    padding: "2px 7px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  confidence: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    color: "#94a3b8",
  },
  detail: {
    padding: "12px 14px",
    marginBottom: 4,
    background: "rgba(17, 24, 39, 0.6)",
    borderRadius: "0 0 8px 8px",
    borderLeft: "3px solid #3b82f6",
    borderBottom: "1px solid rgba(42, 45, 58, 0.4)",
  },
  detailSection: {
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  detailText: {
    fontSize: 13,
    color: "#cbd5e1",
    lineHeight: 1.6,
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 14,
    fontSize: 12,
    color: "#94a3b8",
  },
  pageBtn: {
    padding: "5px 12px",
    background: "rgba(59, 130, 246, 0.1)",
    border: "1px solid rgba(59, 130, 246, 0.25)",
    borderRadius: 6,
    color: "#3b82f6",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },
  pageBtnDisabled: {
    padding: "5px 12px",
    background: "rgba(100, 116, 139, 0.08)",
    border: "1px solid rgba(100, 116, 139, 0.15)",
    borderRadius: 6,
    color: "#475569",
    cursor: "not-allowed",
    fontSize: 11,
    fontWeight: 600,
  },
};
