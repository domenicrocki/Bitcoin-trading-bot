import ErrorBoundary from "./ErrorBoundary";
import BotControls from "./BotControls";
import CandlestickChart from "./CandlestickChart";
import SettingsPanel from "./SettingsPanel";
import SignalCard from "./SignalCard";
import AccountSummary from "./AccountSummary";
import PositionsTable from "./PositionsTable";
import EquityCurve from "./EquityCurve";
import TradeHistory from "./TradeHistory";

export default function Dashboard() {
  return (
    <div className="dashboard-grid">
      {/* Row 1: Bot Controls — full width */}
      <div className="dashboard-grid__full">
        <ErrorBoundary fallbackTitle="Bot Controls Fehler">
          <BotControls />
        </ErrorBoundary>
      </div>

      {/* Row 2: Chart (2/3) + Settings (1/3) */}
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

      {/* Row 3: Latest Signal — full width */}
      <div className="dashboard-grid__full">
        <ErrorBoundary fallbackTitle="Signal Fehler">
          <SignalCard />
        </ErrorBoundary>
      </div>

      {/* Row 4: Account Summary — full width */}
      <div className="dashboard-grid__full">
        <ErrorBoundary fallbackTitle="Konto Fehler">
          <AccountSummary />
        </ErrorBoundary>
      </div>

      {/* Row 5: Open Positions (1/2) + Equity Curve (1/2) */}
      <div>
        <ErrorBoundary fallbackTitle="Positionen Fehler">
          <PositionsTable />
        </ErrorBoundary>
      </div>
      <div>
        <ErrorBoundary fallbackTitle="Equity Kurve Fehler">
          <EquityCurve />
        </ErrorBoundary>
      </div>

      {/* Row 6: Trade History — full width */}
      <div className="dashboard-grid__full">
        <ErrorBoundary fallbackTitle="Trade History Fehler">
          <TradeHistory />
        </ErrorBoundary>
      </div>
    </div>
  );
}
