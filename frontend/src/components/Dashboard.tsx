import ErrorBoundary from "./ErrorBoundary";
import BotControls from "./BotControls";
import CandlestickChart from "./CandlestickChart";
import SettingsPanel from "./SettingsPanel";
import SignalCard from "./SignalCard";
import PortfolioOverview from "./PortfolioOverview";
import EquityCurve from "./EquityCurve";
import AnalysisHistory from "./AnalysisHistory";

export default function Dashboard() {
  return (
    <div className="dashboard-grid">
      {/* Row 1: Bot Controls */}
      <div className="dashboard-grid__full">
        <ErrorBoundary fallbackTitle="Bot Controls Fehler">
          <BotControls />
        </ErrorBoundary>
      </div>

      {/* Row 2: Chart + Settings */}
      <div className="dashboard-grid__two-thirds">
        <ErrorBoundary fallbackTitle="Chart Fehler">
          <CandlestickChart />
        </ErrorBoundary>
      </div>
      <div className="dashboard-grid__one-third">
        <ErrorBoundary fallbackTitle="Einstellungen Fehler">
          <SettingsPanel />
        </ErrorBoundary>
      </div>

      {/* Row 3: Signal + Equity Curve */}
      <div className="dashboard-grid__two-thirds">
        <ErrorBoundary fallbackTitle="Signal Fehler">
          <SignalCard />
        </ErrorBoundary>
      </div>
      <div className="dashboard-grid__one-third">
        <ErrorBoundary fallbackTitle="Equity Kurve Fehler">
          <EquityCurve />
        </ErrorBoundary>
      </div>

      {/* Row 4: Portfolio Overview (full width - replaces old positions + trade history) */}
      <div className="dashboard-grid__full">
        <ErrorBoundary fallbackTitle="Portfolio Fehler">
          <PortfolioOverview />
        </ErrorBoundary>
      </div>

      {/* Row 5: Analysis History */}
      <div className="dashboard-grid__full">
        <ErrorBoundary fallbackTitle="Analysehistorie Fehler">
          <AnalysisHistory />
        </ErrorBoundary>
      </div>
    </div>
  );
}
