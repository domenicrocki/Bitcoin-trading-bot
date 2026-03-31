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
        <BotControls />
      </div>

      {/* Row 2: Chart (2/3) + Settings (1/3) */}
      <div className="dashboard-grid__two-thirds">
        <CandlestickChart />
      </div>
      <div className="dashboard-grid__one-third">
        <SettingsPanel />
      </div>

      {/* Row 3: Latest Signal — full width */}
      <div className="dashboard-grid__full">
        <SignalCard />
      </div>

      {/* Row 4: Account Summary — full width */}
      <div className="dashboard-grid__full">
        <AccountSummary />
      </div>

      {/* Row 5: Open Positions (1/2) + Equity Curve (1/2) */}
      <div>
        <PositionsTable />
      </div>
      <div>
        <EquityCurve />
      </div>

      {/* Row 6: Trade History — full width */}
      <div className="dashboard-grid__full">
        <TradeHistory />
      </div>
    </div>
  );
}
