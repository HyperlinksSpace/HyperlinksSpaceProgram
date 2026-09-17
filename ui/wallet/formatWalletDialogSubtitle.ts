import type { AppStringKey } from "../../locales/appStrings";
import { trimWalletAddress, walletAddressHeaderSnippet } from "./walletAddressFormat";

type Translate = (key: AppStringKey) => string;
type TranslateFormat = (
  key: AppStringKey,
  params: Record<string, string>,
) => string;

/**
 * Subtitle for wallet-scoped dialogs.
 * When `displayName` is empty or only repeats the dialog title / a generic wallet-kind
 * label, show the address snippet alone (no “Imported wallet · Imported wallet”).
 */
export function formatWalletDialogSubtitle(
  displayName: string,
  walletAddress: string,
  t: Translate,
  tf: TranslateFormat,
  options?: { omitNames?: readonly string[] },
): string {
  const trimmed = trimWalletAddress(walletAddress);
  const snippet = walletAddressHeaderSnippet(trimmed);
  const name = displayName.trim();
  const emDash = t("common.emDash");
  const omit = new Set(
    (options?.omitNames ?? []).map((value) => value.trim()).filter(Boolean),
  );
  omit.add(emDash);
  omit.add(t("home.header.importedWallet"));
  omit.add(t("home.header.connectedWallet"));
  omit.add(t("home.header.builtinWallet"));
  omit.add(t("home.header.walletCurrenciesTitle"));

  if (name && !omit.has(name)) {
    return tf("wallet.dialogSubtitleNamed", { name, snippet });
  }
  return tf("wallet.dialogSubtitleAddress", { snippet });
}

/** Subtitle for Get — TonConnect external wallet (not the app built-in wallet). */
export function formatConnectedWalletDialogSubtitle(
  walletName: string | null | undefined,
  walletAddress: string | null | undefined,
  t: Translate,
  tf: TranslateFormat,
): string {
  const trimmed = trimWalletAddress(walletAddress ?? "");
  if (!trimmed) {
    return t("get.chooseCurrencyNotConnected");
  }
  const name = walletName?.trim() || "";
  return formatWalletDialogSubtitle(name, trimmed, t, tf);
}
