import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { SmartPanelContent } from "../components/smart/SmartPanelContent";

export function SmartScreen() {
  return (
    <AuthenticatedAppShell>
      <SmartPanelContent />
    </AuthenticatedAppShell>
  );
}
