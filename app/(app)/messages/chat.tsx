import { Redirect } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useAuthenticatedHomeRouteWideLayout } from "../../../ui/authenticatedHomeLayoutWidth";
import {
  getAuthenticatedHomeSelectedChatSnapshot,
  useAuthenticatedHomeSelectedChat,
} from "../../../ui/authenticatedHomeSelectedChat";
import { logPageDisplay } from "../../../ui/pageDisplayLog";
import { MessageChatCompactScreen } from "../../../ui/screens/MessageChatCompactScreen";

export default function MessageChatRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const isWide = useAuthenticatedHomeRouteWideLayout();
  const chat = useAuthenticatedHomeSelectedChat();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!authReady || !isAuthenticated || isWide) return;
    if (getAuthenticatedHomeSelectedChatSnapshot() != null) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    logPageDisplay("messages_chat_route_missing_selection", {});
  }, [authReady, isAuthenticated, isWide]);

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }
  if (isWide) {
    return <Redirect href="/" />;
  }
  if (chat == null) {
    return <Redirect href="/" />;
  }

  return <MessageChatCompactScreen />;
}
