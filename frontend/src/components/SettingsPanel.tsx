import React, { useState, useEffect } from "react";
import { useSettings, useUpdateSettings } from "../api/hooks";
import type { SettingsUpdate } from "../types/index";
import {
  SUPPORTED_PAIRS,
  SUPPORTED_AI_PROVIDERS,
  SUPPORTED_INTERVALS,
} from "../types/index";

const AI_PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI (ChatGPT)",
  gemini: "Google Gemini",
  anthropic: "Anthropic (Claude)",
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: "linear-gradient(135deg, #1a1d29 0%, #12141c 100%)",
    border: "1px solid #2a2d3a",
    borderRadius: 12,
    padding: 28,
    color: "#e2e8f0",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    maxWidth: 620,
    width: "100%",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 24,
    color: "#f1f5f9",
    borderBottom: "1px solid #2a2d3a",
    paddingBottom: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#8b95a5",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 14,
  },
  fieldGroup: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  fieldFull: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    gridColumn: "1 / -1",
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "#94a3b8",
  },
  select: {
    background: "#0f1117",
    border: "1px solid #2a2d3a",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#e2e8f0",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
    transition: "border-color 0.2s",
  },
  input: {
    background: "#0f1117",
    border: "1px solid #2a2d3a",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#e2e8f0",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  radioGroup: {
    display: "flex",
    gap: 8,
  },
  radioBtn: {
    flex: 1,
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #2a2d3a",
    background: "#0f1117",
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "center" as const,
    transition: "all 0.2s",
  },
  radioBtnActive: {
    flex: 1,
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #3b82f6",
    background: "rgba(59, 130, 246, 0.15)",
    color: "#3b82f6",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center" as const,
    transition: "all 0.2s",
  },
  sliderContainer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  slider: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    appearance: "none" as const,
    background: "linear-gradient(90deg, #ef4444 0%, #eab308 50%, #22c55e 100%)",
    outline: "none",
    cursor: "pointer",
  },
  sliderValue: {
    fontSize: 16,
    fontWeight: 700,
    color: "#f1f5f9",
    minWidth: 44,
    textAlign: "right" as const,
  },
  tpRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
  },
  tpInput: {
    background: "#0f1117",
    border: "1px solid #2a2d3a",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#e2e8f0",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  tpError: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 4,
  },
  tpOk: {
    color: "#22c55e",
    fontSize: 12,
    marginTop: 4,
  },
  toggle: {
    position: "relative" as const,
    width: 48,
    height: 26,
    borderRadius: 13,
    cursor: "pointer",
    transition: "background 0.3s",
    border: "none",
    outline: "none",
    flexShrink: 0,
  },
  toggleKnob: {
    position: "absolute" as const,
    top: 3,
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#fff",
    transition: "left 0.3s",
    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 0",
  },
  saveBtn: {
    width: "100%",
    padding: "14px 24px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 24,
    transition: "all 0.2s",
    letterSpacing: 0.5,
  },
  saveBtnDisabled: {
    width: "100%",
    padding: "14px 24px",
    borderRadius: 10,
    border: "none",
    background: "#2a2d3a",
    color: "#64748b",
    fontSize: 16,
    fontWeight: 600,
    cursor: "not-allowed",
    marginTop: 24,
    letterSpacing: 0.5,
  },
  feedback: {
    textAlign: "center" as const,
    marginTop: 12,
    fontSize: 14,
    fontWeight: 500,
    minHeight: 20,
  },
  divider: {
    borderTop: "1px solid #1e2130",
    margin: "20px 0",
  },
};

export default function SettingsPanel() {
  const { data: settings, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  const [form, setForm] = useState<SettingsUpdate>({});
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        ai_provider: settings.ai_provider,
        trading_pair: settings.trading_pair,
        analysis_interval: settings.analysis_interval,
        leverage: settings.leverage,
        max_risk_pct: settings.max_risk_pct,
        max_positions: settings.max_positions,
        daily_loss_limit_pct: settings.daily_loss_limit_pct,
        max_drawdown_pct: settings.max_drawdown_pct,
        min_confidence: settings.min_confidence,
        tp1_pct: settings.tp1_pct,
        tp2_pct: settings.tp2_pct,
        tp3_pct: settings.tp3_pct,
        allow_shorts: settings.allow_shorts,
      });
    }
  }, [settings]);

  const tpSum = (form.tp1_pct ?? 0) + (form.tp2_pct ?? 0) + (form.tp3_pct ?? 0);
  const tpValid = Math.abs(tpSum - 100) < 0.01;

  const handleSave = async () => {
    if (!tpValid) return;
    setFeedback(null);
    try {
      await updateMutation.mutateAsync(form);
      setFeedback({ type: "success", message: "Einstellungen gespeichert!" });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Fehler beim Speichern";
      setFeedback({ type: "error", message });
    }
  };

  const updateField = <K extends keyof SettingsUpdate>(
    key: K,
    value: SettingsUpdate[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div style={styles.panel}>
        <div style={styles.title}>Einstellungen</div>
        <div style={{ color: "#64748b", textAlign: "center", padding: 40 }}>
          Lade Einstellungen...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Einstellungen</div>

      {/* AI Provider & Trading Pair */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Allgemein</div>
        <div style={styles.fieldGroup}>
          <div style={styles.field}>
            <label style={styles.label}>KI-Anbieter</label>
            <select
              style={styles.select}
              value={form.ai_provider ?? ""}
              onChange={(e) => updateField("ai_provider", e.target.value)}
            >
              {SUPPORTED_AI_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {AI_PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Handels-Paar</label>
            <select
              style={styles.select}
              value={form.trading_pair ?? ""}
              onChange={(e) => updateField("trading_pair", e.target.value)}
            >
              {SUPPORTED_PAIRS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Analysis Interval */}
      <div style={styles.section}>
        <label style={styles.label}>Analyse-Intervall</label>
        <div style={{ ...styles.radioGroup, marginTop: 6 }}>
          {SUPPORTED_INTERVALS.map((interval) => (
            <button
              key={interval}
              type="button"
              style={
                form.analysis_interval === interval
                  ? styles.radioBtnActive
                  : styles.radioBtn
              }
              onClick={() => updateField("analysis_interval", interval)}
            >
              {interval}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.divider} />

      {/* Risk Management */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Risikomanagement</div>
        <div style={styles.fieldGroup}>
          <div style={styles.field}>
            <label style={styles.label}>Hebel (1-10)</label>
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              style={styles.input}
              value={form.leverage ?? 1}
              onChange={(e) =>
                updateField(
                  "leverage",
                  Math.max(1, Math.min(10, Number(e.target.value)))
                )
              }
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Max. Risiko pro Trade (%)</label>
            <input
              type="number"
              min={0.1}
              max={5}
              step={0.1}
              style={styles.input}
              value={form.max_risk_pct ?? 1}
              onChange={(e) =>
                updateField(
                  "max_risk_pct",
                  Math.max(0.1, Math.min(5, Number(e.target.value)))
                )
              }
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Max. Positionen (1-5)</label>
            <input
              type="number"
              min={1}
              max={5}
              step={1}
              style={styles.input}
              value={form.max_positions ?? 3}
              onChange={(e) =>
                updateField(
                  "max_positions",
                  Math.max(1, Math.min(5, Number(e.target.value)))
                )
              }
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Tagesverlustlimit (%)</label>
            <input
              type="number"
              min={1}
              max={10}
              step={0.5}
              style={styles.input}
              value={form.daily_loss_limit_pct ?? 5}
              onChange={(e) =>
                updateField(
                  "daily_loss_limit_pct",
                  Math.max(1, Math.min(10, Number(e.target.value)))
                )
              }
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Max. Drawdown (%)</label>
            <input
              type="number"
              min={5}
              max={30}
              step={1}
              style={styles.input}
              value={form.max_drawdown_pct ?? 20}
              onChange={(e) =>
                updateField(
                  "max_drawdown_pct",
                  Math.max(5, Math.min(30, Number(e.target.value)))
                )
              }
            />
          </div>
        </div>
      </div>

      <div style={styles.divider} />

      {/* Confidence Slider */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>KI-Konfiguration</div>
        <div style={styles.field}>
          <label style={styles.label}>Mindest-Konfidenz</label>
          <div style={styles.sliderContainer}>
            <span style={{ color: "#64748b", fontSize: 12 }}>50%</span>
            <input
              type="range"
              min={50}
              max={95}
              step={1}
              style={styles.slider}
              value={form.min_confidence ?? 70}
              onChange={(e) =>
                updateField("min_confidence", Number(e.target.value))
              }
            />
            <span style={{ color: "#64748b", fontSize: 12 }}>95%</span>
            <span style={styles.sliderValue}>
              {form.min_confidence ?? 70}%
            </span>
          </div>
        </div>
      </div>

      <div style={styles.divider} />

      {/* Take Profit Distribution */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Take-Profit Verteilung</div>
        <div style={styles.tpRow}>
          <div style={styles.field}>
            <label style={styles.label}>TP1 (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              style={styles.tpInput}
              value={form.tp1_pct ?? 0}
              onChange={(e) =>
                updateField("tp1_pct", Math.max(0, Number(e.target.value)))
              }
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>TP2 (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              style={styles.tpInput}
              value={form.tp2_pct ?? 0}
              onChange={(e) =>
                updateField("tp2_pct", Math.max(0, Number(e.target.value)))
              }
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>TP3 (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              style={styles.tpInput}
              value={form.tp3_pct ?? 0}
              onChange={(e) =>
                updateField("tp3_pct", Math.max(0, Number(e.target.value)))
              }
            />
          </div>
        </div>
        <div style={tpValid ? styles.tpOk : styles.tpError}>
          {tpValid
            ? "Summe: 100% - Korrekt"
            : `Summe: ${tpSum.toFixed(0)}% - Muss 100% ergeben`}
        </div>
      </div>

      <div style={styles.divider} />

      {/* Allow Shorts Toggle */}
      <div style={styles.section}>
        <div style={styles.toggleRow}>
          <label style={styles.label}>Short-Positionen erlauben</label>
          <button
            type="button"
            style={{
              ...styles.toggle,
              background: form.allow_shorts ? "#22c55e" : "#374151",
            }}
            onClick={() => updateField("allow_shorts", !form.allow_shorts)}
          >
            <div
              style={{
                ...styles.toggleKnob,
                left: form.allow_shorts ? 25 : 3,
              }}
            />
          </button>
        </div>
      </div>

      {/* Save Button */}
      <button
        type="button"
        style={
          !tpValid || updateMutation.isPending
            ? styles.saveBtnDisabled
            : styles.saveBtn
        }
        disabled={!tpValid || updateMutation.isPending}
        onClick={handleSave}
        onMouseEnter={(e) => {
          if (tpValid && !updateMutation.isPending) {
            (e.currentTarget as HTMLButtonElement).style.transform =
              "translateY(-1px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 4px 20px rgba(59, 130, 246, 0.4)";
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "none";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
        }}
      >
        {updateMutation.isPending ? "Speichere..." : "Einstellungen speichern"}
      </button>

      {/* Feedback */}
      <div
        style={{
          ...styles.feedback,
          color: feedback?.type === "success" ? "#22c55e" : "#ef4444",
        }}
      >
        {feedback?.message ?? ""}
      </div>
    </div>
  );
}
