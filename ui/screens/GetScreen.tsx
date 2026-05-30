import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { GetPanelContent } from "../components/get/GetPanelContent";
import { useTelegram } from "../components/Telegram";
import { useAppStrings } from "../../locales/AppStringsContext";

export function GetScreen() {
  const { wallet, displayName } = useTelegram();
  const { t } = useAppStrings();
  const headerDisplayName = displayName?.trim() || t("common.emDash");

  return (
    <AuthenticatedAppShell>
      <GetPanelContent
        showTitleRow
        walletAddress={wallet?.wallet_address ?? ""}
        displayName={headerDisplayName}
      />
    </AuthenticatedAppShell>
  );
}
