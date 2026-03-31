import { useState, useEffect } from "react";
import {
  useBotStatus,
  useStartBot,
  useStopBot,
  useTriggerAnalysis,
} from "../api/hooks";

function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function BotControls() {
  const { data: status } = useBotStatus();
  const startBot = useStartBot();
  const stopBot = useStopBot();
  const triggerAnalysis = useTriggerAnalysis();

  const isRunning = status?.is_running ?? false;

  // Live uptime counter
  const [uptime, setUptime] = useState<number>(status?.uptime_seconds ?? 0);

  useEffect(() => {
    if (status?.uptime_seconds != null) {
      setUptime(status.uptime_seconds);
    }
  }, [status?.uptime_seconds]);

  useEffect(() => {
    if (!isRunning) {
      setUptime(0);
      return;
    }
    const interval = setInterval(() => {
      setUptime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleToggle = () => {
    if (isRunning) {
      stopBot.mutate();
    } else {
      startBot.mutate();
    }
  };

  const handleTrigger = () => {
    if (isRunning) {
      triggerAnalysis.mutate();
    }
  };

  const isPending = startBot.isPending || stopBot.isPending;

  return (
    <div className="card">
      <div className="card__header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className={`status-dot ${
              isRunning ? "status-dot--running" : "status-dot--stopped"
            }`}
          />
          <span className="card__title">Bot Controls</span>
          <span
            style={{
              fontSize: 12,
              color: isRunning ? "var(--green)" : "var(--red)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {isRunning ? "Running" : "Stopped"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className={`btn ${isRunning ? "btn-danger" : "btn-success"}`}
            onClick={handleToggle}
            disabled={isPending}
          >
            {isPending
              ? "..."
              : isRunning
                ? "Stop Bot"
                : "Start Bot"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleTrigger}
            disabled={!isRunning || triggerAnalysis.isPending}
          >
            {triggerAnalysis.isPending ? "Analyzing..." : "Trigger Analysis"}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-item">
          <span className="stat-item__label">Uptime</span>
          <span
            className="stat-item__value"
            style={{ color: isRunning ? "var(--green)" : "var(--text-muted)" }}
          >
            {formatUptime(uptime)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">Trading Pair</span>
          <span className="stat-item__value" style={{ fontSize: 16 }}>
            {status?.active_pair ?? "--"}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">AI Provider</span>
          <span
            className="stat-item__value"
            style={{ fontSize: 14, textTransform: "capitalize" }}
          >
            {status?.ai_provider ?? "--"}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">Open Positions</span>
          <span className="stat-item__value">
            {status?.open_positions ?? 0}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">Last Analysis</span>
          <span className="stat-item__value" style={{ fontSize: 14 }}>
            {formatTime(status?.last_analysis)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">Next Analysis</span>
          <span className="stat-item__value" style={{ fontSize: 14 }}>
            {formatTime(status?.next_analysis)}
          </span>
        </div>
      </div>
    </div>
  );
}
