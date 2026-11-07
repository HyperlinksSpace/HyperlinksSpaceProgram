import { Redirect } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useAuthenticatedHomeCompactChatLayout } from "../../../ui/authenticatedHomeLayoutWidth";
import {
  getAuthenticatedHomeSelectedChatSnapshot,
  useAuthenticatedHomeSelectedChat,
} from "../../../ui/authenticatedHomeSelectedChat";
import { logPageDisplay } from "../../../ui/pageDisplayLog";
import { MessageChatCompactScreen } from "../../../ui/screens/MessageChatCompactScreen";

export default function MessageChatRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const compactChatLayout = useAuthenticatedHomeCompactChatLayout();
  const chat = useAuthenticatedHomeSelectedChat();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !compactChatLayout) return;
    if (getAuthenticatedHomeSelectedChatSnapshot() != null) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    logPageDisplay("messages_chat_route_missing_selection", {});
  }, [authReady, isAuthenticated, compactChatLayout]);

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }
  if (!compactChatLayout) {
    return <Redirect href="/" />;
  }
  if (chat == null) {
    return <Redirect href="/" />;
  }

  return <MessageChatCompactScreen />;
}
