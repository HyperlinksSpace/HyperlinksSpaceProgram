import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { SmartsPanelContent } from "../components/smarts/SmartsPanelContent";

export function SmartsScreen() {
  return (
    <AuthenticatedAppShell>
      <SmartsPanelContent />
    </AuthenticatedAppShell>
  );
}
