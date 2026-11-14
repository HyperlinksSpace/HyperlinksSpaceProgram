import { useCallback, useLayoutEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  clearAuthenticatedHomeSelectedChat,
  ensureAuthenticatedHomeHistoryLoadArmed,
  useAuthenticatedHomeSelectedChat,
} from "../authenticatedHomeSelectedChat";
import { useCompactChatOverlayGate } from "../components/CompactChatOverlayContext";
import { GlobalBottomBar } from "../components/GlobalBottomBar";
import { MessageChatPanel } from "../components/messages/MessageChatPanel";
import { useAppStrings } from "../../locales/AppStringsContext";
import { navigateBackOrHome } from "../navigateBackOrHome";
import { setCompactChatRouteUiOpen } from "../compactChatRouteGate";
import { isIosTelegramMiniAppSync } from "../components/telegramWebApp";
import { abortIosCompetingReads } from "../telegram/iosCompetingRead";
import { resetSharedOpenChatHistoryLoad } from "../messageChatHistoryPrefetch";
import { layout, useColors } from "../theme";

/** Narrow layout: dedicated chat route (not a fixed overlay on home). */
export function MessageChatCompactScreen() {
  const colors = useColors();
  const { t } = useAppStrings();
  const router = useRouter();
  const chat = useAuthenticatedHomeSelectedChat();
  const { setCompactChatOpen } = useCompactChatOverlayGate();

  useLayoutEffect(() => {
    if (chat == null) return;
    setCompactChatRouteUiOpen(true);
    ensureAuthenticatedHomeHistoryLoadArmed(chat);
    if (isIosTelegramMiniAppSync()) {
      // Drop a list-started body that never completes after route change; the
      // chat page will issue a fresh worker read on /messages/chat.
      abortIosCompetingReads();
      resetSharedOpenChatHistoryLoad(chat.telegram_chat_id);
      return () => {
        setCompactChatRouteUiOpen(false);
      };
    }
    const runPrefetch = () => {
      void import("../messageChatHistoryPrefetch").then(
        ({ prefetchChatHistoryPriority }) => {
          prefetchChatHistoryPriority(chat);
        },
      );
    };
    runPrefetch();
    const retry =
      typeof window !== "undefined" ? window.setTimeout(runPrefetch, 200) : null;
    return () => {
      if (retry != null) window.clearTimeout(retry);
      setCompactChatRouteUiOpen(false);
    };
  }, [chat?.telegram_chat_id]);

  useLayoutEffect(() => {
    setCompactChatOpen(true);
    return () => setCompactChatOpen(false);
  }, [setCompactChatOpen]);

  const onBack = useCallback(() => {
    clearAuthenticatedHomeSelectedChat();
    navigateBackOrHome(router);
  }, [router]);

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
          overflow: "hidden",
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
