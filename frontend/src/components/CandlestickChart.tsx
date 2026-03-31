import { useEffect, useRef, useCallback, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
  ColorType,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";
import { useCandles, useBotStatus, useSettings } from "../api/hooks";
import { useBotStore } from "../store/useBotStore";
import type { Candle } from "../types/index";

// ── Indicator calculations (client-side from candle data) ───────────────────

function calcSMA(data: Candle[], period: number): LineData[] {
  const result: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    result.push({ time: (data[i].time / 1000) as Time, value: sum / period });
  }
  return result;
}

function calcEMA(data: Candle[], period: number): LineData[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const result: LineData[] = [];
  let ema = data[0].close;
  for (let i = 0; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    if (i >= period - 1) {
      result.push({ time: (data[i].time / 1000) as Time, value: ema });
    }
  }
  return result;
}

function calcBollingerBands(data: Candle[], period: number = 20, mult: number = 2) {
  const upper: LineData[] = [];
  const middle: LineData[] = [];
  const lower: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    const mean = sum / period;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (data[j].close - mean) ** 2;
    const std = Math.sqrt(sqSum / period);
    const t = (data[i].time / 1000) as Time;
    upper.push({ time: t, value: mean + mult * std });
    middle.push({ time: t, value: mean });
    lower.push({ time: t, value: mean - mult * std });
  }
  return { upper, middle, lower };
}

// ── Indicator config ────────────────────────────────────────────────────────

type IndicatorKey = "sma20" | "sma50" | "ema9" | "ema21" | "bb" | "volume";

interface IndicatorDef {
  label: string;
  color: string;
  defaultOn: boolean;
}

const INDICATORS: Record<IndicatorKey, IndicatorDef> = {
  ema9:  { label: "EMA 9",  color: "#f59e0b", defaultOn: false },
  ema21: { label: "EMA 21", color: "#8b5cf6", defaultOn: false },
  sma20: { label: "SMA 20", color: "#3b82f6", defaultOn: true },
  sma50: { label: "SMA 50", color: "#ec4899", defaultOn: false },
  bb:    { label: "Bollinger", color: "#06b6d4", defaultOn: false },
  volume:{ label: "Volumen",  color: "#64748b", defaultOn: true },
};

// ── Component ───────────────────────────────────────────────────────────────

export default function CandlestickChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line" | "Histogram">>>(new Map());
  const lastCandleRef = useRef<CandlestickData | null>(null);

  const { data: status } = useBotStatus();
  const { data: settings } = useSettings();
  const pair = status?.active_pair ?? "BTCUSDT";
  const interval = settings?.analysis_interval ?? "1h";
  const { data: candles } = useCandles(pair, interval);
  const currentPrice = useBotStore((s) => s.currentPrice);

  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(() => {
    const defaults = new Set<IndicatorKey>();
    for (const [key, def] of Object.entries(INDICATORS)) {
      if (def.defaultOn) defaults.add(key as IndicatorKey);
    }
    return defaults;
  });

  const toggleIndicator = (key: IndicatorKey) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Initialize chart
  const initChart = useCallback(() => {
    if (!containerRef.current) return;
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    overlaySeriesRef.current.clear();

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 340,
      layout: {
        background: { type: ColorType.Solid, color: "#111827" },
        textColor: "#94a3b8",
        fontSize: 11,
        fontFamily: "'Inter', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.4)" },
        horzLines: { color: "rgba(30, 41, 59, 0.4)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(59, 130, 246, 0.4)", width: 1, style: 2, labelBackgroundColor: "#3b82f6" },
        horzLine: { color: "rgba(59, 130, 246, 0.4)", width: 1, style: 2, labelBackgroundColor: "#3b82f6" },
      },
      rightPriceScale: { borderColor: "#1e293b", scaleMargins: { top: 0.05, bottom: 0.2 } },
      timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 7 },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
  }, []);

  useEffect(() => {
    initChart();
    return () => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [initChart]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !chartRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (chartRef.current && width > 0) chartRef.current.applyOptions({ width });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Load candle data + overlays
  useEffect(() => {
    if (!candles || candles.length === 0 || !chartRef.current || !candleSeriesRef.current) return;

    const candleData: CandlestickData[] = candles.map((c) => ({
      time: (c.time / 1000) as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    candleSeriesRef.current.setData(candleData);
    if (candleData.length > 0) lastCandleRef.current = candleData[candleData.length - 1];

    // Remove old overlays
    for (const [, series] of overlaySeriesRef.current) {
      try { chartRef.current.removeSeries(series); } catch { /* */ }
    }
    overlaySeriesRef.current.clear();

    // Volume
    if (activeIndicators.has("volume")) {
      const volSeries = chartRef.current.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chartRef.current.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volSeries.setData(candles.map((c) => ({
        time: (c.time / 1000) as Time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
      })));
      overlaySeriesRef.current.set("volume", volSeries);
    }

    // SMA / EMA lines
    const lineOverlays: { key: IndicatorKey; data: LineData[]; color: string }[] = [];
    if (activeIndicators.has("sma20")) lineOverlays.push({ key: "sma20", data: calcSMA(candles, 20), color: INDICATORS.sma20.color });
    if (activeIndicators.has("sma50")) lineOverlays.push({ key: "sma50", data: calcSMA(candles, 50), color: INDICATORS.sma50.color });
    if (activeIndicators.has("ema9"))  lineOverlays.push({ key: "ema9",  data: calcEMA(candles, 9),  color: INDICATORS.ema9.color });
    if (activeIndicators.has("ema21")) lineOverlays.push({ key: "ema21", data: calcEMA(candles, 21), color: INDICATORS.ema21.color });

    for (const { key, data, color } of lineOverlays) {
      const s = chartRef.current.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(data);
      overlaySeriesRef.current.set(key, s);
    }

    // Bollinger Bands
    if (activeIndicators.has("bb")) {
      const bb = calcBollingerBands(candles, 20, 2);
      const bbColor = INDICATORS.bb.color;
      const upperS = chartRef.current.addLineSeries({ color: bbColor, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
      const midS = chartRef.current.addLineSeries({ color: bbColor, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false });
      const lowerS = chartRef.current.addLineSeries({ color: bbColor, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
      upperS.setData(bb.upper);
      midS.setData(bb.middle);
      lowerS.setData(bb.lower);
      overlaySeriesRef.current.set("bb_upper", upperS);
      overlaySeriesRef.current.set("bb_mid", midS);
      overlaySeriesRef.current.set("bb_lower", lowerS);
    }

    chartRef.current.timeScale().fitContent();
  }, [candles, activeIndicators]);

  // Live price update
  useEffect(() => {
    if (currentPrice == null || !candleSeriesRef.current || !lastCandleRef.current) return;
    const updated: CandlestickData = {
      ...lastCandleRef.current,
      close: currentPrice,
      high: Math.max(lastCandleRef.current.high, currentPrice),
      low: Math.min(lastCandleRef.current.low, currentPrice),
    };
    candleSeriesRef.current.update(updated);
    lastCandleRef.current = updated;
  }, [currentPrice]);

  // 24h change
  const change24h = candles && candles.length >= 2
    ? ((candles[candles.length - 1].close - candles[0].close) / candles[0].close) * 100
    : null;

  return (
    <div className="card" style={{ padding: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{pair}</span>
          <span style={{ fontSize: 12, color: "#64748b" }}>{interval}</span>
          {currentPrice != null && (
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>
              ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {change24h != null && (
            <span style={{
              fontSize: 12, fontWeight: 600, fontFamily: "var(--font-mono, monospace)",
              color: change24h >= 0 ? "#10b981" : "#ef4444",
            }}>
              {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Indicator Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {(Object.entries(INDICATORS) as [IndicatorKey, IndicatorDef][]).map(([key, def]) => {
          const isActive = activeIndicators.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleIndicator(key)}
              style={{
                padding: "3px 10px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${isActive ? def.color : "rgba(100,116,139,0.25)"}`,
                background: isActive ? `${def.color}20` : "transparent",
                color: isActive ? def.color : "#64748b",
                transition: "all 0.15s",
              }}
            >
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: 2,
                background: isActive ? def.color : "#475569", marginRight: 5,
              }} />
              {def.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="chart-container" ref={containerRef} />
    </div>
  );
}
