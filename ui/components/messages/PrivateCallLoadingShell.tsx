import { useMemo } from "react";
import { Modal, Platform, Text, useWindowDimensions, View } from "react-native";
import { useColors } from "../../theme";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { useTelegram } from "../Telegram";
import { FloatingDialogCloseButton } from "../FloatingDialogCloseButton";
import { resolveFloatingDialogViewportInsets } from "../floatingDialogChrome";
import { MessageChatAvatarSlot } from "./MessageChatAvatarSlot";
import { extractChatAvatarInitials } from "./chatAvatarInitials";
import { resolveTelegramThreadAvatarUrl } from "./resolveTelegramThreadAvatarUrl";
import type { MessageChatRowData } from "./MessageChatRow";

type Props = {
  chat: MessageChatRowData;
  onClose: () => void;
};

/** Instant overlay while the private-call host chunk loads. */
export function PrivateCallLoadingShell({ chat, onClose }: Props) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const { colorScheme, safeAreaInsetTop, contentSafeAreaInsetTop, isInTelegram } = useTelegram();
  const { t } = useAppStrings();
  const title = (chat.title ?? "").trim() || t("messages.privateCall.active");
  const avatarUrl = resolveTelegramThreadAvatarUrl(chat);
  const initials = extractChatAvatarInitials(title);
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

  return (
    <Modal
      visible
      transparent={Platform.OS === "web"}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: viewportInsets.left,
          paddingTop: viewportInsets.top,
          paddingBottom: viewportInsets.bottom,
        }}
      >
        <FloatingDialogCloseButton
          label={t("common.close")}
          onPress={onClose}
          style={{
            position: "absolute",
            top: viewportInsets.top,
            right: viewportInsets.right,
          }}
        />
        <MessageChatAvatarSlot
          iconUrl={avatarUrl}
          initials={initials}
          sizePx={120}
          colors={colors}
          scheme={colorScheme}
          fetchPriority="high"
        />
        <Text
          style={{
            marginTop: 20,
            fontSize: 22,
            fontWeight: "600",
            color: colors.primary,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontSize: 16,
            color: colors.secondary,
            textAlign: "center",
          }}
        >
          {t("messages.privateCall.calling")}
        </Text>
      </View>
    </Modal>
  );
}
