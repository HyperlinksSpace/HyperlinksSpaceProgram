import { useCallback, useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  clearAuthenticatedHomeSelectedChat,
  useAuthenticatedHomeSelectedChat,
} from "../authenticatedHomeSelectedChat";
import { useCompactChatOverlayGate } from "../components/CompactChatOverlayGate";
import { GlobalBottomBar } from "../components/GlobalBottomBar";
import { MessageChatPanel } from "../components/messages/MessageChatPanel";
import { useAppStrings } from "../locales/AppStringsContext";
import { navigateBackOrHome } from "../navigateBackOrHome";
import { layout, useColors } from "../theme";
import { useTelegramWebAppBackButton } from "../telegram/useTelegramWebAppBackButton";

/** Narrow layout: dedicated chat route (not a fixed overlay on home). */
export function MessageChatCompactScreen() {
  const colors = useColors();
  const { t } = useAppStrings();
  const router = useRouter();
  const chat = useAuthenticatedHomeSelectedChat();
  const { setCompactChatOpen } = useCompactChatOverlayGate();

  useEffect(() => {
    setCompactChatOpen(true);
    return () => setCompactChatOpen(false);
  }, [setCompactChatOpen]);

  const onBack = useCallback(() => {
    clearAuthenticatedHomeSelectedChat();
    navigateBackOrHome(router);
  }, [router]);

  useTelegramWebAppBackButton(onBack, chat != null);

  if (chat == null) {
    return null;
  }

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        backgroundColor: colors.background,
        flexDirection: "column",
      }}
    >
      <View
        style={{
          flex: 1,
          minHeight: 0,
          alignSelf: "stretch",
          paddingHorizontal: layout.contentSideInsetPx,
          overflow: "visible",
        }}
      >
        <MessageChatPanel
          chat={chat}
          colors={colors}
          visible
          compactPage
          onBack={onBack}
          backAccessibilityLabel={t("messages.archive.back")}
        />
      </View>
      <View style={{ width: "100%", flexShrink: 0, alignSelf: "stretch" }}>
        <GlobalBottomBar />
      </View>
    </View>
  );
}
