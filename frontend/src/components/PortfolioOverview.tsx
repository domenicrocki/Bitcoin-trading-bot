import React from "react";
import { usePortfolio } from "../api/hooks";

const fmtUsd = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPnl = (v: number) => `${v >= 0 ? "+" : ""}${fmtUsd(v)}`;
const pnlColor = (v: number) => v >= 0 ? "#10b981" : "#ef4444";

export default function PortfolioOverview() {
  const { data: p, isLoading } = usePortfolio();

  if (isLoading || !p) {
    return <div style={S.container}><div style={S.loading}>Lade Portfolio...</div></div>;
  }

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>Portfolio</span>
        <span style={S.exchange}>{p.exchange?.toUpperCase() ?? "BINANCE"}</span>
      </div>

      {/* Key Metrics */}
      <div style={S.metricsGrid}>
        <Metric label="Balance" value={`${fmtUsd(p.balance)} USDT`} />
        <Metric label="Eigenkapital" value={`${fmtUsd(p.equity)} USDT`} />
        <Metric label="Unrealisiert" value={`${fmtPnl(p.unrealized_pnl)} USDT`} color={pnlColor(p.unrealized_pnl)} />
        <Metric label="Realisiert" value={`${fmtPnl(p.realized_pnl)} USDT`} color={pnlColor(p.realized_pnl)} />
        <Metric label="Tages-P&L" value={`${fmtPnl(p.daily_pnl)} USDT`} color={pnlColor(p.daily_pnl)} />
        <Metric label="Win Rate" value={`${p.win_rate}%`} color={p.win_rate >= 50 ? "#10b981" : "#f59e0b"} />
        <Metric label="Trades" value={String(p.total_trades)} />
        <Metric label="Max Drawdown" value={`${p.max_drawdown}%`} color={p.max_drawdown > 15 ? "#ef4444" : "#f59e0b"} />
      </div>

      {/* Open Positions */}
      <div style={S.section}>
        <div style={S.sectionTitle}>
          Offene Positionen
          <span style={S.count}>{p.open_positions?.length ?? 0}</span>
        </div>
        {(!p.open_positions || p.open_positions.length === 0) ? (
          <div style={S.empty}>Keine offenen Positionen</div>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Paar</th>
                  <th style={S.th}>Seite</th>
                  <th style={S.th}>Einstieg</th>
                  <th style={S.th}>Aktuell</th>
                  <th style={S.th}>Menge</th>
                  <th style={S.th}>SL</th>
                  <th style={S.th}>TP1</th>
                  <th style={S.th}>TP2</th>
                  <th style={S.th}>TP3</th>
                  <th style={S.th}>P&L</th>
                  <th style={S.th}>P&L%</th>
                </tr>
              </thead>
              <tbody>
                {p.open_positions.map((pos: any) => (
                  <tr key={pos.id} style={S.tr}>
                    <td style={{ ...S.td, fontWeight: 700, color: "#f1f5f9" }}>{pos.symbol}</td>
                    <td style={S.td}>
                      <span style={{
                        ...S.badge,
                        background: pos.side === "LONG" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                        color: pos.side === "LONG" ? "#10b981" : "#ef4444",
                      }}>{pos.side}</span>
                    </td>
                    <td style={S.tdMono}>{fmtUsd(pos.entry_price)}</td>
                    <td style={{ ...S.tdMono, fontWeight: 700, color: "#f1f5f9" }}>{fmtUsd(pos.current_price)}</td>
                    <td style={S.tdMono}>{pos.quantity}</td>
                    <td style={{ ...S.tdMono, color: "#ef4444" }}>{pos.stop_loss ? fmtUsd(pos.stop_loss) : "-"}</td>
                    <td style={S.tdMono}>{pos.tp1 ? `${fmtUsd(pos.tp1)}${pos.tp1_filled ? " ✓" : ""}` : "-"}</td>
                    <td style={S.tdMono}>{pos.tp2 ? `${fmtUsd(pos.tp2)}${pos.tp2_filled ? " ✓" : ""}` : "-"}</td>
                    <td style={S.tdMono}>{pos.tp3 ? `${fmtUsd(pos.tp3)}${pos.tp3_filled ? " ✓" : ""}` : "-"}</td>
                    <td style={{ ...S.tdMono, fontWeight: 700, color: pnlColor(pos.unrealized_pnl) }}>
                      {fmtPnl(pos.unrealized_pnl)}
                    </td>
                    <td style={{ ...S.tdMono, color: pnlColor(pos.unrealized_pnl_pct) }}>
                      {pos.unrealized_pnl_pct >= 0 ? "+" : ""}{pos.unrealized_pnl_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Closed Trades */}
      <div style={S.section}>
        <div style={S.sectionTitle}>
          Letzte Trades
          <span style={S.count}>{p.closed_trades?.length ?? 0}</span>
        </div>
        {(!p.closed_trades || p.closed_trades.length === 0) ? (
          <div style={S.empty}>Noch keine abgeschlossenen Trades</div>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Paar</th>
                  <th style={S.th}>Seite</th>
                  <th style={S.th}>Einstieg</th>
                  <th style={S.th}>Ausstieg</th>
                  <th style={S.th}>P&L</th>
                  <th style={S.th}>P&L%</th>
                  <th style={S.th}>KI</th>
                  <th style={S.th}>Datum</th>
                </tr>
              </thead>
              <tbody>
                {p.closed_trades.map((t: any) => (
                  <tr key={t.id} style={S.tr}>
                    <td style={{ ...S.td, fontWeight: 700, color: "#f1f5f9" }}>{t.symbol}</td>
                    <td style={S.td}>
                      <span style={{
                        ...S.badge,
                        background: t.side === "LONG" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                        color: t.side === "LONG" ? "#10b981" : "#ef4444",
                      }}>{t.side}</span>
                    </td>
                    <td style={S.tdMono}>{t.entry_price ? fmtUsd(t.entry_price) : "-"}</td>
                    <td style={S.tdMono}>{t.exit_price ? fmtUsd(t.exit_price) : "-"}</td>
                    <td style={{ ...S.tdMono, fontWeight: 700, color: pnlColor(t.pnl ?? 0) }}>
                      {t.pnl != null ? fmtPnl(t.pnl) : "-"}
                    </td>
                    <td style={{ ...S.tdMono, color: pnlColor(t.pnl_pct ?? 0) }}>
                      {t.pnl_pct != null ? `${t.pnl_pct >= 0 ? "+" : ""}${t.pnl_pct}%` : "-"}
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.badge, background: "rgba(139,92,246,0.12)", color: "#a78bfa" }}>
                        {t.ai_provider ?? "-"}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontSize: 11, color: "#64748b" }}>
                      {t.closed_at ? new Date(t.closed_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={S.metric}>
      <div style={S.metricLabel}>{label}</div>
      <div style={{ ...S.metricValue, color: color ?? "#f1f5f9" }}>{value}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: { background: "#0d1117", border: "1px solid #1e293b", borderRadius: 10, padding: 20, color: "#e2e8f0", fontFamily: "'Inter', sans-serif" },
  loading: { textAlign: "center", padding: 40, color: "#64748b" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 800, color: "#f1f5f9" },
  exchange: { fontSize: 11, fontWeight: 700, color: "#3b82f6", background: "rgba(59,130,246,0.1)", padding: "3px 10px", borderRadius: 4, letterSpacing: 0.5 },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 },
  metric: { background: "#111827", border: "1px solid #1e293b", borderRadius: 8, padding: "12px 14px" },
  metricLabel: { fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#f1f5f9" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 },
  count: { fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "rgba(59,130,246,0.1)", padding: "1px 8px", borderRadius: 10 },
  empty: { textAlign: "center" as const, padding: 24, color: "#475569", fontSize: 13 },
  tableWrap: { overflowX: "auto" as const, borderRadius: 8, border: "1px solid #1e293b" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 },
  th: { textAlign: "left" as const, padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: 0.8, background: "#111827", borderBottom: "1px solid #1e293b", whiteSpace: "nowrap" as const },
  td: { padding: "8px 10px", borderBottom: "1px solid rgba(30,41,59,0.4)", color: "#94a3b8", whiteSpace: "nowrap" as const },
  tdMono: { padding: "8px 10px", borderBottom: "1px solid rgba(30,41,59,0.4)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" as const },
  tr: { transition: "background 0.1s" },
  badge: { display: "inline-block", padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 },
};
