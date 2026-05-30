import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { SendPanelContent } from "../components/send/SendPanelContent";

export function SendScreen() {
  return (
    <AuthenticatedAppShell>
      <SendPanelContent />
    </AuthenticatedAppShell>
  );
}
