import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type LayoutRectangle,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { WEB_UI_MONO_STACK } from "../../fonts";
import { useTonConnectSession } from "../../ton/TonConnectProvider";
import { typographyAeroport15, useColors } from "../../theme";
import {
  isActiveWalletSelection,
  preferBuiltinWallet,
  preferImportedWallet,
  preferTonConnectPending,
  preferTonConnectWallet,
  sameWalletAddress,
  useActiveWalletPreference,
} from "../../wallet/activeWalletPreference";
import {
  readImportedWallets,
  subscribeImportedWallets,
} from "../../wallet/importedWalletsStore";
import { useWalletUsdBalanceByAddress } from "../../wallet/useWalletUsdBalanceByAddress";
import { resolveFloatingDialogViewportInsets } from "../floatingDialogChrome";
import { clampAnchoredMenuPosition } from "../floatingDialogGeometry";
import { HyperlinksSpaceLogo } from "../HyperlinksSpaceLogo";
import { useTelegram } from "../Telegram";
import { AddWalletMethodDialog } from "./AddWalletMethodDialog";
import { ConnectedWalletNameplate } from "./ConnectedWalletNameplate";
import { ImportWalletMnemonicDialog } from "./ImportWalletMnemonicDialog";
import { WalletChoiceRadio } from "./WalletChoiceRadio";

const WALLET_ICON_PX = 18;
const PLUS_ICON_PX = 14;

function middleEllipsisAddress(address: string, head = 6, tail = 6): string {
  const trimmed = address.trim();
  if (trimmed.length <= head + tail + 3) return trimmed;
  return `${trimmed.slice(0, head)}...${trimmed.slice(-tail)}`;
}

function PlusGlyph({ color, size = PLUS_ICON_PX }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 3v10M3 8h10"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Recovery-phrase / imported wallet mark (distinct from built-in logo & TonConnect). */
function ImportedWalletGlyph({
  color,
  size = WALLET_ICON_PX,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M5 2.75h8c.69 0 1.25.56 1.25 1.25v10c0 .69-.56 1.25-1.25 1.25H5c-.69 0-1.25-.56-1.25-1.25v-10c0-.69.56-1.25 1.25-1.25z"
        stroke={color}
        strokeWidth={1.4}
      />
      <Path
        d="M6.5 6.25h5M6.5 9h5M6.5 11.75h3.25"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export type SwitchWalletMenuAnchor = LayoutRectangle;

type WalletRow = {
  key: string;
  address: string;
  displayAddress: string;
  name: string | null;
  imageUrl: string | null;
  connected: boolean;
  builtin: boolean;
  imported: boolean;
};

type Props = {
  visible: boolean;
  anchor: SwitchWalletMenuAnchor | null;
  /** App registration / built-in wallet address shown in the header. */
  builtinAddress: string;
  onClose: () => void;
};

/** Popover: available wallets (built-in + TonConnect + imported) with CONNECTED plates + add. */
export function SwitchWalletMenu({ visible, anchor, builtinAddress, onClose }: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const ton = useTonConnectSession();
  const preference = useActiveWalletPreference();
  const importedWallets = useSyncExternalStore(
    subscribeImportedWallets,
    readImportedWallets,
    readImportedWallets,
  );
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { safeAreaInsetTop, contentSafeAreaInsetTop } = useTelegram();
  const [busy, setBusy] = useState(false);
  const [addMethodOpen, setAddMethodOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const viewportInsets = useMemo(
    () =>
      resolveFloatingDialogViewportInsets({
        windowWidth,
        safeAreaInsetTop,
        contentSafeAreaInsetTop,
      }),
    [contentSafeAreaInsetTop, safeAreaInsetTop, windowWidth],
  );

  useEffect(() => {
    if (visible) ton.refreshRememberedWallets();
  }, [ton, visible]);

  const activeTon = ton.friendlyAddress || ton.address;
  const builtin = builtinAddress.trim();

  const wallets = useMemo((): WalletRow[] => {
    const rows: WalletRow[] = [];
    if (builtin) {
      rows.push({
        key: `builtin:${builtin}`,
        address: builtin,
        displayAddress: builtin,
        name: t("home.header.builtinWallet"),
        imageUrl: null,
        connected: false,
        builtin: true,
        imported: false,
      });
    }
    for (const row of importedWallets) {
      const display = (row.friendlyAddress || row.address).trim();
      if (!display) continue;
      if (sameWalletAddress(display, builtin) || sameWalletAddress(row.address, builtin)) {
        continue;
      }
      rows.push({
        key: row.id,
        address: row.address,
        displayAddress: display,
        name: row.name?.trim() || t("home.header.importedWallet"),
        imageUrl: null,
        connected: false,
        builtin: false,
        imported: true,
      });
    }
    const list = [...ton.rememberedWallets];
    if (
      activeTon &&
      !list.some(
        (row) =>
          sameWalletAddress(row.address, activeTon) ||
          sameWalletAddress(row.friendlyAddress, activeTon),
      )
    ) {
      list.unshift({
        address: activeTon,
        friendlyAddress: activeTon,
        name: ton.walletName,
        imageUrl: ton.walletImageUrl,
        lastConnectedAt: Date.now(),
      });
    }
    for (const row of list) {
      const display = (row.friendlyAddress || row.address).trim();
      if (!display) continue;
      if (sameWalletAddress(display, builtin) || sameWalletAddress(row.address, builtin)) {
        continue;
      }
      if (
        importedWallets.some(
          (imp) =>
            sameWalletAddress(imp.address, display) || sameWalletAddress(imp.address, row.address),
        )
      ) {
        continue;
      }
      const connected =
        Boolean(ton.connected) &&
        (sameWalletAddress(display, activeTon) || sameWalletAddress(row.address, activeTon));
      rows.push({
        key: `ton:${row.address}`,
        address: row.address,
        displayAddress: display,
        name: row.name ?? null,
        imageUrl: row.imageUrl ?? null,
        connected,
        builtin: false,
        imported: false,
      });
    }
    return rows;
  }, [
    activeTon,
    builtin,
    importedWallets,
    t,
    ton.connected,
    ton.rememberedWallets,
    ton.walletImageUrl,
    ton.walletName,
  ]);

  const walletUsdLabels = useWalletUsdBalanceByAddress(
    wallets.map((row) => row.displayAddress),
    { enabled: visible, builtinAddress: builtin || null },
  );

  const openTonConnectPicker = useCallback(async () => {
    setBusy(true);
    onClose();
    try {
      // Mark adopt-on-success without clearing the currently selected wallet.
      preferTonConnectPending();
      if (ton.connected) {
        await ton.disconnect();
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200);
      });
      await ton.openConnectModal();
    } finally {
      setBusy(false);
    }
  }, [onClose, ton]);

  const onSelectWallet = useCallback(
    async (row: WalletRow) => {
      if (row.builtin) {
        preferBuiltinWallet();
        onClose();
        if (ton.connected) {
          setBusy(true);
          try {
            await ton.disconnect();
          } finally {
            setBusy(false);
          }
        }
        return;
      }

      if (row.imported) {
        preferImportedWallet(row.displayAddress || row.address);
        onClose();
        if (ton.connected) {
          setBusy(true);
          try {
            await ton.disconnect();
          } finally {
            setBusy(false);
          }
        }
        return;
      }

      preferTonConnectWallet(row.displayAddress || row.address);
      onClose();
      // Prefer the chosen remembered wallet without opening the TonConnect picker.
      // If a different session is live, drop it so UI/balances follow the preference.
      const alreadyConnected =
        Boolean(ton.connected) &&
        (sameWalletAddress(row.displayAddress, activeTon) ||
          sameWalletAddress(row.address, activeTon));
      if (ton.connected && !alreadyConnected) {
        setBusy(true);
        try {
          await ton.disconnect();
        } finally {
          setBusy(false);
        }
      }
    },
    [activeTon, onClose, ton],
  );

  const onImported = useCallback(
    (address: string) => {
      preferImportedWallet(address);
      setImportOpen(false);
      onClose();
    },
    [onClose],
  );

  const menuWidth = 280;
  const preferred = clampAnchoredMenuPosition({
    left: anchor ? anchor.x : viewportInsets.left,
    top: anchor ? anchor.y + anchor.height + 8 : viewportInsets.top + 48,
    menuWidth,
    menuHeight: 320,
    windowWidth,
    windowHeight,
    insets: viewportInsets,
  });
  const menuTop = preferred.top;
  const menuLeft = preferred.left;

  return (
    <>
      {visible ? (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
          <Pressable style={{ flex: 1 }} onPress={onClose}>
            <Pressable
              style={{
                position: "absolute",
                top: menuTop,
                left: menuLeft,
                minWidth: 260,
                maxWidth: 340,
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.highlight,
                borderRadius: 0,
                paddingVertical: 6,
                overflow: "hidden",
              }}
              onPress={(e) => e.stopPropagation?.()}
            >
              {wallets.map((row) => {
                const selected = isActiveWalletSelection({
                  preference,
                  rowBuiltin: row.builtin,
                  rowImported: row.imported,
                  rowAddress: row.displayAddress || row.address,
                });
                return (
                  <Pressable
                    key={row.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={busy}
                    onPress={() => void onSelectWallet(row)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      backgroundColor: selected ? colors.undercover : "transparent",
                    }}
                  >
                    {row.builtin ? (
                      <View
                        style={{
                          width: WALLET_ICON_PX,
                          height: WALLET_ICON_PX,
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <HyperlinksSpaceLogo width={WALLET_ICON_PX} height={WALLET_ICON_PX} />
                      </View>
                    ) : row.imported ? (
                      <View
                        style={{
                          width: WALLET_ICON_PX,
                          height: WALLET_ICON_PX,
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <ImportedWalletGlyph color={colors.primary} />
                      </View>
                    ) : row.imageUrl ? (
                      <Image
                        source={{ uri: row.imageUrl }}
                        style={{ width: WALLET_ICON_PX, height: WALLET_ICON_PX, borderRadius: 4 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: WALLET_ICON_PX,
                          height: WALLET_ICON_PX,
                          borderRadius: 4,
                          backgroundColor: "#0098EA",
                        }}
                      />
                    )}
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        {row.name ? (
                          <Text
                            style={[
                              typographyAeroport15,
                              {
                                color: colors.primary,
                                fontWeight: "400",
                                flexShrink: 1,
                                minWidth: 0,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {row.name}
                          </Text>
                        ) : null}
                        {row.connected ? <ConnectedWalletNameplate /> : null}
                      </View>
                      <Text
                        style={[
                          typographyAeroport15,
                          {
                            color: colors.secondary,
                            fontFamily: Platform.OS === "web" ? WEB_UI_MONO_STACK : undefined,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {middleEllipsisAddress(row.displayAddress)}
                      </Text>
                    </View>
                    {walletUsdLabels[row.displayAddress.trim().toLowerCase()] ? (
                      <Text
                        style={[
                          typographyAeroport15,
                          { color: colors.secondary, flexShrink: 0 },
                        ]}
                      >
                        {walletUsdLabels[row.displayAddress.trim().toLowerCase()]}
                      </Text>
                    ) : null}
                    <WalletChoiceRadio selected={selected} color={colors.primary} />
                  </Pressable>
                );
              })}

              <View style={{ height: 1, backgroundColor: colors.highlight, alignSelf: "stretch" }} />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("home.header.addWallet")}
                disabled={busy}
                onPress={() => {
                  onClose();
                  setAddMethodOpen(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                }}
              >
                <View
                  style={{
                    width: WALLET_ICON_PX,
                    height: WALLET_ICON_PX,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PlusGlyph color={colors.primary} />
                </View>
                <Text style={[typographyAeroport15, { color: colors.primary, fontWeight: "400" }]}>
                  {t("home.header.addWallet")}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <AddWalletMethodDialog
        visible={addMethodOpen}
        onClose={() => setAddMethodOpen(false)}
        onChooseTonConnect={() => {
          setAddMethodOpen(false);
          void openTonConnectPicker();
        }}
        onChooseRecoveryPhrase={() => {
          setAddMethodOpen(false);
          setImportOpen(true);
        }}
      />

      <ImportWalletMnemonicDialog
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={onImported}
      />
    </>
  );
}
