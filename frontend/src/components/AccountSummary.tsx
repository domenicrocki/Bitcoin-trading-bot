import React from "react";
import { useAccount } from "../api/hooks";

interface MetricCardProps {
  label: string;
  value: string;
  color?: string;
  sub?: string;
  subColor?: string;
  progress?: number;
  progressColor?: string;
  warning?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    width: "100%",
  },
  card: {
    background: "linear-gradient(135deg, #1a1d29 0%, #12141c 100%)",
    border: "1px solid #2a2d3a",
    borderRadius: 10,
    padding: "18px 20px",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    transition: "border-color 0.2s, transform 0.15s",
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  value: {
    fontSize: 22,
    fontWeight: 800,
    color: "#f1f5f9",
    lineHeight: 1.2,
  },
  sub: {
    fontSize: 12,
    fontWeight: 600,
    marginTop: 4,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    background: "#1e2130",
    marginTop: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.5s ease",
  },
  loading: {
    textAlign: "center" as const,
    padding: 40,
    color: "#64748b",
    fontSize: 15,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
};

function MetricCard({
  label,
  value,
  color,
  sub,
  subColor,
  progress,
  progressColor,
  warning,
}: MetricCardProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      style={{
        ...styles.card,
        borderColor: warning
          ? "rgba(239, 68, 68, 0.35)"
          : hovered
          ? "#3b82f6"
          : "#2a2d3a",
        transform: hovered ? "translateY(-2px)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.label}>{label}</div>
      <div style={{ ...styles.value, color: color ?? "#f1f5f9" }}>{value}</div>
      {sub && (
        <div style={{ ...styles.sub, color: subColor ?? "#64748b" }}>{sub}</div>
      )}
      {progress != null && (
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${Math.min(100, Math.max(0, progress))}%`,
              background: progressColor ?? "#3b82f6",
            }}
          />
        </div>
      )}
    </div>
  );
}

function formatUSDT(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + "M";
  }
  if (Math.abs(value) >= 10_000) {
    return (value / 1_000).toFixed(1) + "K";
  }
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pnlSign(value: number): string {
  return value >= 0 ? "+" : "";
}

function pnlColor(value: number): string {
  return value >= 0 ? "#22c55e" : "#ef4444";
}

export default function AccountSummary() {
  const { data: account, isLoading } = useAccount();

  if (isLoading || !account) {
    return <div style={styles.loading}>Lade Kontodaten...</div>;
  }

  const winRatePct = account.win_rate; // Backend already returns 0-100%
  const drawdownWarning = account.max_drawdown >= 15;

  return (
    <div style={styles.container}>
      <MetricCard
        label="Kontostand"
        value={`${formatUSDT(account.balance)} USDT`}
      />
      <MetricCard
        label="Eigenkapital"
        value={`${formatUSDT(account.equity)} USDT`}
      />
      <MetricCard
        label="Gesamt P&L"
        value={`${pnlSign(account.total_pnl)}${formatUSDT(account.total_pnl)} USDT`}
        color={pnlColor(account.total_pnl)}
        sub={`${pnlSign(account.total_pnl_pct)}${account.total_pnl_pct.toFixed(2)}%`}
        subColor={pnlColor(account.total_pnl_pct)}
      />
      <MetricCard
        label="Gewinnrate"
        value={`${winRatePct.toFixed(1)}%`}
        color={winRatePct >= 50 ? "#22c55e" : "#eab308"}
        progress={winRatePct}
        progressColor={winRatePct >= 50 ? "#22c55e" : "#eab308"}
      />
      <MetricCard
        label="Trades gesamt"
        value={account.total_trades.toString()}
      />
      <MetricCard
        label="Offene Positionen"
        value={account.open_positions.toString()}
        color={account.open_positions > 0 ? "#3b82f6" : "#94a3b8"}
      />
      <MetricCard
        label="Tages-P&L"
        value={`${pnlSign(account.daily_pnl)}${formatUSDT(account.daily_pnl)} USDT`}
        color={pnlColor(account.daily_pnl)}
      />
      <MetricCard
        label="Max. Drawdown"
        value={`${account.max_drawdown.toFixed(1)}%`}
        color={drawdownWarning ? "#ef4444" : "#eab308"}
        warning={drawdownWarning}
        progress={account.max_drawdown}
        progressColor={drawdownWarning ? "#ef4444" : "#eab308"}
      />
    </div>
  );
}
