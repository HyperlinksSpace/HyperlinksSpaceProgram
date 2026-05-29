import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { TradePanelContent } from "../components/trade/TradePanelContent";

export function TradeScreen() {
  return (
    <AuthenticatedAppShell>
      <TradePanelContent />
    </AuthenticatedAppShell>
  );
}
