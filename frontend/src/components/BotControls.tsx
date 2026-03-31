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
    return new Date(iso).toLocaleTimeString("de-DE", {
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
      {/* Top row: Status + Buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: "1px solid var(--border-primary, #1e293b)",
        }}
      >
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
              color: isRunning ? "var(--green, #10b981)" : "var(--red, #ef4444)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {isRunning ? "Aktiv" : "Gestoppt"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button
            className={`btn ${isRunning ? "btn-danger" : "btn-success"}`}
            onClick={handleToggle}
            disabled={isPending}
          >
            {isPending ? "..." : isRunning ? "Bot Stoppen" : "Bot Starten"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleTrigger}
            disabled={!isRunning || triggerAnalysis.isPending}
          >
            {triggerAnalysis.isPending ? "Analysiert..." : "Analyse Triggern"}
          </button>
        </div>
      </div>

      {/* Bottom row: Stats */}
      <div className="stat-grid">
        <div className="stat-item">
          <span className="stat-item__label">Laufzeit</span>
          <span
            className="stat-item__value"
            style={{ color: isRunning ? "var(--green, #10b981)" : "var(--text-muted, #64748b)" }}
          >
            {formatUptime(uptime)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">Handels-Paar</span>
          <span className="stat-item__value" style={{ fontSize: 16 }}>
            {status?.active_pair ?? "--"}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">KI-Anbieter</span>
          <span
            className="stat-item__value"
            style={{ fontSize: 14, textTransform: "capitalize" }}
          >
            {status?.ai_provider ?? "--"}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">Offene Pos.</span>
          <span className="stat-item__value">
            {status?.open_positions ?? 0}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">Letzte Analyse</span>
          <span className="stat-item__value" style={{ fontSize: 14 }}>
            {formatTime(status?.last_analysis)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-item__label">Nächste Analyse</span>
          <span className="stat-item__value" style={{ fontSize: 14 }}>
            {formatTime(status?.next_analysis)}
          </span>
        </div>
      </div>
    </div>
  );
}
