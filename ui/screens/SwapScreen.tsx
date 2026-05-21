import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { SwapPanelContent } from "../components/SwapPanelContent";

export function SwapScreen() {
  return (
    <AuthenticatedAppShell>
      <SwapPanelContent />
    </AuthenticatedAppShell>
  );
}
