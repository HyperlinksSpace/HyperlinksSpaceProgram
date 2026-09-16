import { useCallback, useMemo } from "react";
import { useWindowDimensions } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { openAuthenticatedHomeRightPanel } from "../../authenticatedHomeRightPanel";
import { useWalletHeldCurrencyRows } from "../../wallet/useWalletHeldCurrencyRows";
import { formatWalletDialogSubtitle } from "../../wallet/formatWalletDialogSubtitle";
import type { ChooseCurrencyRow } from "../swap/chooseCurrencyTableTypes";
import { getInitDataString } from "../telegramWebApp";
import { resolveFloatingDialogInsets } from "../floatingDialogChrome";
import { resolveFloatingDialogDefaultSize } from "../floatingDialogGeometry";
import { FloatingDialogShell } from "../FloatingDialogShell";
import { FloatingDialogBody } from "../FloatingDialogBody";
import { FloatingDialogStickyHeader } from "../FloatingDialogStickyHeader";
import { ChooseCurrencyTable } from "../swap/ChooseCurrencyTable";

const WALLET_HELD_COLUMNS = ["currency", "balance", "value", "rate"] as const;

export type WalletCurrenciesDialogKind = "builtin" | "imported" | "tonconnect";

type Props = {
  visible: boolean;
  onClose: () => void;
  walletAddress: string;
  displayName: string;
  /** Which wallet is open — controls dialog title. */
  walletKind?: WalletCurrenciesDialogKind;
  title?: string;
};

/** Floating dialog listing currencies held on the currently chosen wallet. */
export function WalletCurrenciesDialog({
  visible,
  onClose,
  walletAddress,
  displayName,
  walletKind = "builtin",
  title: titleProp,
}: Props) {
  const { t, tf } = useAppStrings();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const defaultSize = useMemo(
    () => resolveFloatingDialogDefaultSize(windowWidth, windowHeight, "picker"),
    [windowHeight, windowWidth],
  );
  const dialogInsets = resolveFloatingDialogInsets(windowHeight);
  const trimmedWallet = walletAddress.trim() || null;
  const { rows, isLoading, error } = useWalletHeldCurrencyRows(
    trimmedWallet,
    visible,
    getInitDataString(),
    { includeDllrLedger: true },
  );
  const title =
    titleProp ??
    (walletKind === "imported"
      ? t("home.header.importedWallet")
      : walletKind === "tonconnect"
        ? t("home.header.connectedWallet")
        : t("home.header.walletCurrenciesTitle"));
  const subtitle = formatWalletDialogSubtitle(displayName, walletAddress, t, tf);

  const onWalletAction = useCallback(
    (action: "send" | "swap" | "get", _row: ChooseCurrencyRow) => {
      openAuthenticatedHomeRightPanel(action);
      onClose();
    },
    [onClose],
  );

  return (
    <FloatingDialogShell
      visible={visible}
      zIndex={10070}
      defaultSize={defaultSize}
      minSize={{ width: 340, height: 240 }}
      sizeStorageKey="hsp.walletCurrencies.size.v3"
      offsetStorageKey="hsp.walletCurrencies.offset.v2"
      onRequestClose={onClose}
      testId="wallet-currencies"
    >
      <FloatingDialogBody>
        <FloatingDialogStickyHeader
          insets={dialogInsets}
          title={title}
          subtitle={subtitle}
          onClose={onClose}
          closeLabel={t("common.close")}
        />
        <ChooseCurrencyTable
          rows={rows}
          isLoading={isLoading}
          loadError={error}
          visibleColumnKeys={WALLET_HELD_COLUMNS}
          prefetchCharts={false}
          listEmptyMessage={t("home.header.walletCurrenciesEmpty")}
          contentInsetPx={dialogInsets.padX}
          onWalletAction={onWalletAction}
        />
      </FloatingDialogBody>
    </FloatingDialogShell>
  );
}
