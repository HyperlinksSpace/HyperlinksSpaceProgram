import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { SendPanelContent } from "../components/send/SendPanelContent";
import { useTelegram } from "../components/Telegram";

export function SendScreen() {
  const { wallet } = useTelegram();

  return (
    <AuthenticatedAppShell>
      <SendPanelContent walletAddress={wallet?.wallet_address ?? ""} />
    </AuthenticatedAppShell>
  );
}
