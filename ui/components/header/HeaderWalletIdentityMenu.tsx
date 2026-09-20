import { useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type LayoutRectangle,
} from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { WEB_UI_MONO_STACK } from "../../fonts";
import {
  homeWalletAddressHeaderText,
  typographyAeroport15,
  useColors,
  welcomeAuthButtonActiveBackground,
  welcomeAuthButtonHoverBackground,
} from "../../theme";
import { resolveFloatingDialogViewportInsets } from "../floatingDialogChrome";
import { clampAnchoredMenuPosition } from "../floatingDialogGeometry";
import { useTelegram } from "../Telegram";
import {
  tonviewerAccountUrl,
  TonviewerGlyph,
} from "../TonviewerExplorerButton";

type Props = {
  visible: boolean;
  anchor: LayoutRectangle | null;
  address: string;
  displayName: string | null;
  onCopyAddress: () => void;
  onClose: () => void;
};

/** Anchored popover: full address, name, and Tonviewer action when the header cluster overflows. */
export function HeaderWalletIdentityMenu({
  visible,
  anchor,
  address,
  displayName,
  onCopyAddress,
  onClose,
}: Props) {
  const colors = useColors();
  const { t, tf } = useAppStrings();
  const { colorScheme, safeAreaInsetTop, contentSafeAreaInsetTop, isInTelegram } = useTelegram();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [tonHover, setTonHover] = useState(false);
  const trimmed = address.trim();
  const name = displayName?.trim() || null;

  const viewportInsets = useMemo(
    () =>
      resolveFloatingDialogViewportInsets({
        windowWidth,
        safeAreaInsetTop,
        contentSafeAreaInsetTop,
        inTelegram: isInTelegram,
      }),
    [contentSafeAreaInsetTop, safeAreaInsetTop, windowWidth],
  );

  const menuWidth = 280;
  const preferred = clampAnchoredMenuPosition({
    left: anchor ? anchor.x + anchor.width - menuWidth : viewportInsets.left,
    top: anchor ? anchor.y + anchor.height + 8 : viewportInsets.top + 48,
    menuWidth,
    menuHeight: 180,
    windowWidth,
    windowHeight,
    insets: viewportInsets,
  });

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Pressable
          style={{
            position: "absolute",
            top: preferred.top,
            left: preferred.left,
            width: menuWidth,
            maxWidth: Math.min(340, windowWidth - 24),
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.highlight,
            paddingVertical: 10,
            paddingHorizontal: 12,
            gap: 10,
          }}
          onPress={(e) => {
            e.stopPropagation?.();
          }}
        >
          {trimmed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tf("home.header.walletAddressA11y", {
                snippet: trimmed,
              })}
              accessibilityHint={t("home.header.copyWalletHint")}
              onPress={() => {
                onCopyAddress();
                onClose();
              }}
              style={{ minWidth: 0 }}
            >
              <Text
                selectable={Platform.OS === "web"}
                style={[
                  homeWalletAddressHeaderText,
                  {
                    color: colors.primary,
                    fontFamily: Platform.OS === "web" ? WEB_UI_MONO_STACK : undefined,
                  },
                ]}
              >
                {trimmed}
              </Text>
            </Pressable>
          ) : null}
          {name ? (
            <Text
              numberOfLines={2}
              style={[typographyAeroport15, { color: colors.secondary }]}
            >
              {name}
            </Text>
          ) : null}
          {trimmed ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("home.header.openTonviewerA11y")}
              onPress={() => {
                void Linking.openURL(tonviewerAccountUrl(trimmed));
                onClose();
              }}
              onHoverIn={Platform.OS === "web" ? () => setTonHover(true) : undefined}
              onHoverOut={Platform.OS === "web" ? () => setTonHover(false) : undefined}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: 36,
                paddingHorizontal: 10,
                paddingVertical: 8,
                backgroundColor: pressed
                  ? welcomeAuthButtonActiveBackground(colors, colorScheme)
                  : tonHover
                    ? welcomeAuthButtonHoverBackground(colors, colorScheme)
                    : colors.undercover,
              })}
            >
              <View>
                <TonviewerGlyph size={16} />
              </View>
              <Text style={[typographyAeroport15, { color: colors.primary, flexShrink: 1 }]}>
                {t("home.header.tonviewerAction")}
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
