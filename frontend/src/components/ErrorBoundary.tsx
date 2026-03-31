import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            color: "#94a3b8",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>!</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>
            {this.props.fallbackTitle ?? "Komponentenfehler"}
          </div>
          <div style={{ fontSize: 12 }}>
            {this.state.error?.message ?? "Unbekannter Fehler"}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 12,
              padding: "6px 16px",
              background: "rgba(59, 130, 246, 0.2)",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              borderRadius: 6,
              color: "#3b82f6",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Erneut versuchen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
