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
import { useCandles, useBotStatus, useSettings, useUpdateSettings } from "../api/hooks";
import { useBotStore } from "../store/useBotStore";
import type { Candle } from "../types/index";

// ── Indicator calculations ──────────────────────────────────────────────────

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
  const upper: LineData[] = [], middle: LineData[] = [], lower: LineData[] = [];
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

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(6);
}

// ── Config ──────────────────────────────────────────────────────────────────

type IndicatorKey = "sma20" | "sma50" | "ema9" | "ema21" | "bb" | "volume";

const INDICATORS: Record<IndicatorKey, { label: string; color: string; defaultOn: boolean }> = {
  ema9:   { label: "EMA 9",     color: "#f59e0b", defaultOn: false },
  ema21:  { label: "EMA 21",    color: "#8b5cf6", defaultOn: false },
  sma20:  { label: "SMA 20",    color: "#3b82f6", defaultOn: true },
  sma50:  { label: "SMA 50",    color: "#ec4899", defaultOn: false },
  bb:     { label: "Bollinger", color: "#06b6d4", defaultOn: false },
  volume: { label: "Vol",       color: "#64748b", defaultOn: true },
};

const TIMEFRAMES = [
  { label: "15m", value: "15m" },
  { label: "1H",  value: "1h" },
];

// ── Styles ──────────────────────────────────────────────────────────────────

const S = {
  wrapper: { background: "#0d1117", border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden" as const },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 0", flexWrap: "wrap" as const, gap: 8 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  pair: { fontSize: 18, fontWeight: 800, color: "#f1f5f9", letterSpacing: -0.5 },
  ohlc: { display: "flex", gap: 12, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "#94a3b8" },
  ohlcLabel: { color: "#475569", marginRight: 3 },
  ohlcUp: { color: "#10b981" },
  ohlcDown: { color: "#ef4444" },
  price: { fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#f1f5f9" },
  change: { fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", padding: "2px 8px", borderRadius: 4 },
  toolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px", borderBottom: "1px solid #1e293b", flexWrap: "wrap" as const, gap: 6 },
  tfGroup: { display: "flex", gap: 2 },
  tfBtn: (active: boolean) => ({
    padding: "4px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: "pointer",
    border: "none",
    background: active ? "#3b82f6" : "transparent",
    color: active ? "#fff" : "#64748b",
    transition: "all 0.15s",
  }),
  indGroup: { display: "flex", gap: 4, flexWrap: "wrap" as const },
  indBtn: (active: boolean, color: string) => ({
    padding: "3px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? color : "rgba(100,116,139,0.2)"}`,
    background: active ? `${color}18` : "transparent",
    color: active ? color : "#475569",
    transition: "all 0.12s",
    letterSpacing: 0.3,
  }),
  chart: { width: "100%", height: 380 },
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
  const updateSettings = useUpdateSettings();
  const pair = status?.active_pair ?? "BTCUSDT";
  const interval = settings?.analysis_interval ?? "1h";
  const { data: candles } = useCandles(pair, interval);
  const currentPrice = useBotStore((s) => s.currentPrice);

  // OHLC of last candle
  const lastCandle = candles && candles.length > 0 ? candles[candles.length - 1] : null;
  const prevClose = candles && candles.length > 1 ? candles[candles.length - 2].close : null;
  const priceChange = lastCandle && prevClose ? lastCandle.close - prevClose : null;
  const priceChangePct = priceChange && prevClose ? (priceChange / prevClose) * 100 : null;
  const isUp = (priceChange ?? 0) >= 0;

  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(() => {
    const d = new Set<IndicatorKey>();
    for (const [k, v] of Object.entries(INDICATORS)) { if (v.defaultOn) d.add(k as IndicatorKey); }
    return d;
  });

  const toggleIndicator = (key: IndicatorKey) => {
    setActiveIndicators((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };

  const switchTimeframe = (tf: string) => {
    if (tf !== interval) updateSettings.mutate({ analysis_interval: tf });
  };

  // Init chart
  const initChart = useCallback(() => {
    if (!containerRef.current) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    overlaySeriesRef.current.clear();

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth, height: 380,
      layout: { background: { type: ColorType.Solid, color: "#0d1117" }, textColor: "#64748b", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
      grid: { vertLines: { color: "rgba(30,41,59,0.3)" }, horzLines: { color: "rgba(30,41,59,0.3)" } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(59,130,246,0.3)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1e293b" },
        horzLine: { color: "rgba(59,130,246,0.3)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1e293b" },
      },
      rightPriceScale: { borderColor: "#1e293b", scaleMargins: { top: 0.05, bottom: 0.18 }, entireTextOnly: true },
      timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 8 },
      handleScroll: { vertTouchDrag: false },
    });

    const cs = chart.addCandlestickSeries({
      upColor: "#10b981", downColor: "#ef4444",
      borderUpColor: "#10b981", borderDownColor: "#ef4444",
      wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    candleSeriesRef.current = cs;
  }, []);

  useEffect(() => { initChart(); return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; } }; }, [initChart]);

  // Resize
  useEffect(() => {
    const c = containerRef.current;
    if (!c || !chartRef.current) return;
    const obs = new ResizeObserver((e) => { for (const en of e) { if (chartRef.current && en.contentRect.width > 0) chartRef.current.applyOptions({ width: en.contentRect.width }); } });
    obs.observe(c);
    return () => obs.disconnect();
  }, []);

  // Data + overlays
  useEffect(() => {
    if (!candles || candles.length === 0 || !chartRef.current || !candleSeriesRef.current) return;

    const cd: CandlestickData[] = candles.map((c) => ({ time: (c.time / 1000) as Time, open: c.open, high: c.high, low: c.low, close: c.close }));
    candleSeriesRef.current.setData(cd);
    if (cd.length > 0) lastCandleRef.current = cd[cd.length - 1];

    for (const [, s] of overlaySeriesRef.current) { try { chartRef.current.removeSeries(s); } catch {} }
    overlaySeriesRef.current.clear();

    // Volume
    if (activeIndicators.has("volume")) {
      const vs = chartRef.current.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      chartRef.current.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      vs.setData(candles.map((c) => ({ time: (c.time / 1000) as Time, value: c.volume, color: c.close >= c.open ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)" })));
      overlaySeriesRef.current.set("volume", vs);
    }

    // Lines
    const lines: { k: string; d: LineData[]; c: string }[] = [];
    if (activeIndicators.has("sma20")) lines.push({ k: "sma20", d: calcSMA(candles, 20), c: INDICATORS.sma20.color });
    if (activeIndicators.has("sma50")) lines.push({ k: "sma50", d: calcSMA(candles, 50), c: INDICATORS.sma50.color });
    if (activeIndicators.has("ema9")) lines.push({ k: "ema9", d: calcEMA(candles, 9), c: INDICATORS.ema9.color });
    if (activeIndicators.has("ema21")) lines.push({ k: "ema21", d: calcEMA(candles, 21), c: INDICATORS.ema21.color });
    for (const { k, d, c } of lines) {
      const s = chartRef.current.addLineSeries({ color: c, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(d); overlaySeriesRef.current.set(k, s);
    }

    // BB
    if (activeIndicators.has("bb")) {
      const bb = calcBollingerBands(candles, 20, 2);
      const bc = INDICATORS.bb.color;
      const u = chartRef.current.addLineSeries({ color: bc, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
      const m = chartRef.current.addLineSeries({ color: bc, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false });
      const l = chartRef.current.addLineSeries({ color: bc, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
      u.setData(bb.upper); m.setData(bb.middle); l.setData(bb.lower);
      overlaySeriesRef.current.set("bb_u", u); overlaySeriesRef.current.set("bb_m", m); overlaySeriesRef.current.set("bb_l", l);
    }

    chartRef.current.timeScale().fitContent();
  }, [candles, activeIndicators]);

  // Live price
  useEffect(() => {
    if (currentPrice == null || !candleSeriesRef.current || !lastCandleRef.current) return;
    const u: CandlestickData = { ...lastCandleRef.current, close: currentPrice, high: Math.max(lastCandleRef.current.high, currentPrice), low: Math.min(lastCandleRef.current.low, currentPrice) };
    candleSeriesRef.current.update(u); lastCandleRef.current = u;
  }, [currentPrice]);

  const displayPrice = currentPrice ?? lastCandle?.close ?? 0;

  return (
    <div style={S.wrapper}>
      {/* ── Header: Pair + Price + OHLC ── */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.pair}>{pair}</span>
          <span style={{ ...S.price, color: isUp ? "#10b981" : "#ef4444" }}>
            {fmtPrice(displayPrice)}
          </span>
          {priceChangePct != null && (
            <span style={{
              ...S.change,
              color: isUp ? "#10b981" : "#ef4444",
              background: isUp ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
            }}>
              {isUp ? "+" : ""}{priceChange!.toFixed(2)} ({isUp ? "+" : ""}{priceChangePct.toFixed(2)}%)
            </span>
          )}
        </div>
        {/* OHLC data */}
        {lastCandle && (
          <div style={S.ohlc}>
            <span><span style={S.ohlcLabel}>O</span>{fmtPrice(lastCandle.open)}</span>
            <span><span style={S.ohlcLabel}>H</span><span style={S.ohlcUp}>{fmtPrice(lastCandle.high)}</span></span>
            <span><span style={S.ohlcLabel}>L</span><span style={S.ohlcDown}>{fmtPrice(lastCandle.low)}</span></span>
            <span><span style={S.ohlcLabel}>C</span>{fmtPrice(lastCandle.close)}</span>
            <span><span style={S.ohlcLabel}>V</span>{lastCandle.volume >= 1000 ? `${(lastCandle.volume / 1000).toFixed(1)}K` : lastCandle.volume.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* ── Toolbar: Timeframes + Indicators ── */}
      <div style={S.toolbar}>
        <div style={S.tfGroup}>
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} style={S.tfBtn(interval === tf.value)} onClick={() => switchTimeframe(tf.value)}>
              {tf.label}
            </button>
          ))}
        </div>
        <div style={S.indGroup}>
          {(Object.entries(INDICATORS) as [IndicatorKey, { label: string; color: string; defaultOn: boolean }][]).map(([key, def]) => (
            <button key={key} style={S.indBtn(activeIndicators.has(key), def.color)} onClick={() => toggleIndicator(key)}>
              {def.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart ── */}
      <div style={S.chart} ref={containerRef} />
    </div>
  );
}
