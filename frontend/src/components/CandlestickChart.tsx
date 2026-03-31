import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import { useCandles, useBotStatus, useSettings } from "../api/hooks";
import { useBotStore } from "../store/useBotStore";

export default function CandlestickChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastCandleRef = useRef<CandlestickData | null>(null);

  const { data: status } = useBotStatus();
  const { data: settings } = useSettings();
  const pair = status?.active_pair ?? "BTCUSDT";
  const interval = settings?.analysis_interval ?? "1h";
  const { data: candles } = useCandles(pair, interval);

  const currentPrice = useBotStore((s) => s.currentPrice);

  // Initialize chart
  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 340,
      layout: {
        background: { type: ColorType.Solid, color: "#111827" },
        textColor: "#94a3b8",
        fontSize: 12,
        fontFamily:
          "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.5)" },
        horzLines: { color: "rgba(30, 41, 59, 0.5)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(59, 130, 246, 0.4)",
          width: 1,
          style: 2,
          labelBackgroundColor: "#3b82f6",
        },
        horzLine: {
          color: "rgba(59, 130, 246, 0.4)",
          width: 1,
          style: 2,
          labelBackgroundColor: "#3b82f6",
        },
      },
      rightPriceScale: {
        borderColor: "#1e293b",
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: "#1e293b",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
      },
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

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
  }, []);

  // Initialize on mount
  useEffect(() => {
    initChart();
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [initChart]);

  // Resize handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !chartRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (chartRef.current && width > 0) {
          chartRef.current.applyOptions({ width });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Load initial candle data
  useEffect(() => {
    if (!candles || candles.length === 0) return;
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const candleData: CandlestickData[] = candles.map((c) => ({
      time: (c.time / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData[] = candles.map((c) => ({
      time: (c.time / 1000) as Time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)",
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    if (candleData.length > 0) {
      lastCandleRef.current = candleData[candleData.length - 1];
    }

    // Fit content with some right margin
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [candles]);

  // Update last candle with live price
  useEffect(() => {
    if (currentPrice == null) return;
    if (!candleSeriesRef.current) return;

    const lastCandle = lastCandleRef.current;
    if (!lastCandle) return;

    const updatedCandle: CandlestickData = {
      ...lastCandle,
      close: currentPrice,
      high: Math.max(lastCandle.high, currentPrice),
      low: Math.min(lastCandle.low, currentPrice),
    };

    candleSeriesRef.current.update(updatedCandle);
    lastCandleRef.current = updatedCandle;
  }, [currentPrice]);

  return (
    <div className="card">
      <div className="card__header">
        <div>
          <span className="card__title">{pair}</span>
          <span className="card__subtitle">&nbsp; {interval} Candlestick</span>
        </div>
        {currentPrice != null && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            ${currentPrice.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        )}
      </div>
      <div className="chart-container" ref={containerRef} />
    </div>
  );
}
