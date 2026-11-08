import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../../../auth/AuthContext";
import { useColors } from "../../../ui/theme";
import { useAuthenticatedHomeCompactChatLayout } from "../../../ui/authenticatedHomeLayoutWidth";
import {
  getAuthenticatedHomeSelectedChatSnapshot,
  useAuthenticatedHomeSelectedChat,
} from "../../../ui/authenticatedHomeSelectedChat";
import { logPageDisplay } from "../../../ui/pageDisplayLog";
import { MessageChatCompactScreen } from "../../../ui/screens/MessageChatCompactScreen";

export default function MessageChatRoute() {
  const colors = useColors();
  const { isAuthenticated, authReady } = useAuth();
  const compactChatLayout = useAuthenticatedHomeCompactChatLayout();
  const chat = useAuthenticatedHomeSelectedChat();
  const chatSnapshot =
    chat ?? (authReady ? getAuthenticatedHomeSelectedChatSnapshot() : null);
  const [selectionGraceExpired, setSelectionGraceExpired] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (chatSnapshot != null) {
      setSelectionGraceExpired(false);
      return;
    }
    if (!authReady) return;
    const timer = setTimeout(() => setSelectionGraceExpired(true), 400);
    return () => clearTimeout(timer);
  }, [authReady, chatSnapshot?.telegram_chat_id]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !compactChatLayout) return;
    if (getAuthenticatedHomeSelectedChatSnapshot() != null) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    logPageDisplay("messages_chat_route_missing_selection", {});
  }, [authReady, isAuthenticated, compactChatLayout]);

  if (!authReady) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 0,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }
  if (!compactChatLayout) {
    return <Redirect href="/" />;
  }
  if (chatSnapshot == null) {
    if (!selectionGraceExpired) {
      return (
        <View
          style={{
            flex: 1,
            minHeight: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.background,
          }}
        >
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    return <Redirect href="/" />;
  }

  return <MessageChatCompactScreen />;
}
