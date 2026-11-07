import { router } from "expo-router";
import { readAuthenticatedHomeCompactChatLayoutSync } from "./authenticatedHomeLayoutWidth";

const COMPACT_CHAT_PATH = "/messages/chat";

/** After `openAuthenticatedHomeChatHistory`, open the full-screen chat route on narrow home. */
export function maybePushAuthenticatedHomeCompactChatRoute(): void {
  if (!readAuthenticatedHomeCompactChatLayoutSync()) return;
  if (typeof window !== "undefined" && window.location.pathname === COMPACT_CHAT_PATH) {
    return;
  }
  router.push(COMPACT_CHAT_PATH);
}
