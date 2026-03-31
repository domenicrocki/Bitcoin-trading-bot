import ErrorBoundary from "./ErrorBoundary";
import BotControls from "./BotControls";
import CandlestickChart from "./CandlestickChart";
import SettingsPanel from "./SettingsPanel";
import SignalCard from "./SignalCard";
import AccountSummary from "./AccountSummary";
import PositionsTable from "./PositionsTable";
import EquityCurve from "./EquityCurve";
import TradeHistory from "./TradeHistory";
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

      {/* Row 2: Account Summary */}
      <div className="dashboard-grid__full">
        <ErrorBoundary fallbackTitle="Konto Fehler">
          <AccountSummary />
        </ErrorBoundary>
      </div>

      {/* Row 3: Chart + Settings */}
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

      {/* Row 4: Signal + Equity Curve */}
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

      {/* Row 5: Open Positions */}
      <div className="dashboard-grid__full">
        <ErrorBoundary fallbackTitle="Positionen Fehler">
          <PositionsTable />
        </ErrorBoundary>
      </div>

      {/* Row 6: Trade History + Analysis History (side by side) */}
      <div>
        <ErrorBoundary fallbackTitle="Trade History Fehler">
          <TradeHistory />
        </ErrorBoundary>
      </div>
      <div>
        <ErrorBoundary fallbackTitle="Analysehistorie Fehler">
          <AnalysisHistory />
        </ErrorBoundary>
      </div>
    </div>
  );
}
