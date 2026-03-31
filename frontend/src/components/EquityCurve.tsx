import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useEquityCurve } from "../api/hooks";
import type { EquityPoint } from "../types/index";

function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return ts;
  }
}

function formatDateFull(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function formatUSDT(value: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface ChartDataPoint {
  timestamp: string;
  equity: number;
  daily_pnl: number;
  label: string;
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
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: "#f1f5f9",
    marginBottom: 20,
  },
  placeholder: {
    textAlign: "center" as const,
    padding: 40,
    color: "#64748b",
    fontSize: 15,
  },
  tooltipContainer: {
    background: "#1a1d29",
    border: "1px solid #2a2d3a",
    borderRadius: 8,
    padding: "10px 14px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
  },
  tooltipLabel: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 6,
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "#f1f5f9",
  },
  tooltipPnl: {
    fontSize: 12,
    fontWeight: 600,
    marginTop: 4,
  },
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartDataPoint;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  const pnlColor = data.daily_pnl >= 0 ? "#22c55e" : "#ef4444";
  const pnlSign = data.daily_pnl >= 0 ? "+" : "";

  return (
    <div style={styles.tooltipContainer}>
      <div style={styles.tooltipLabel}>{formatDateFull(data.timestamp)}</div>
      <div style={styles.tooltipValue}>
        {formatUSDT(data.equity)} USDT
      </div>
      <div style={{ ...styles.tooltipPnl, color: pnlColor }}>
        Tages-P&L: {pnlSign}
        {formatUSDT(data.daily_pnl)} USDT
      </div>
    </div>
  );
}

export default function EquityCurve() {
  const { data: equityData, isLoading } = useEquityCurve();

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!equityData || equityData.length === 0) return [];
    return equityData.map((pt: EquityPoint) => ({
      timestamp: pt.timestamp,
      equity: pt.equity,
      daily_pnl: pt.daily_pnl,
      label: formatDate(pt.timestamp),
    }));
  }, [equityData]);

  const isTrendingUp = useMemo(() => {
    if (chartData.length < 2) return true;
    return chartData[chartData.length - 1].equity >= chartData[0].equity;
  }, [chartData]);

  const lineColor = isTrendingUp ? "#22c55e" : "#ef4444";
  const fillColorStart = isTrendingUp
    ? "rgba(34, 197, 94, 0.25)"
    : "rgba(239, 68, 68, 0.25)";
  const fillColorEnd = isTrendingUp
    ? "rgba(34, 197, 94, 0.02)"
    : "rgba(239, 68, 68, 0.02)";

  const gradientId = "equityGradient";

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.title}>Eigenkapitalverlauf</div>
        <div style={styles.placeholder}>Lade Diagramm...</div>
      </div>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.title}>Eigenkapitalverlauf</div>
        <div style={styles.placeholder}>Noch keine Daten verf\u00FCgbar</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>Eigenkapitalverlauf</div>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillColorStart} stopOpacity={1} />
                <stop
                  offset="100%"
                  stopColor={fillColorEnd}
                  stopOpacity={1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e2130"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={{ stroke: "#1e2130" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatUSDT(v)}
              width={80}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "#3b82f6",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{
                r: 5,
                fill: lineColor,
                stroke: "#1a1d29",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
