import { router } from "expo-router";
import {
  isAuthenticatedHomeWideLayoutWidthPx,
  readAuthenticatedHomeLayoutWidthPx,
} from "./authenticatedHomeLayoutWidth";

const COMPACT_CHAT_PATH = "/messages/chat";

/** After `openAuthenticatedHomeChatHistory`, open the full-screen chat route on narrow home. */
export function maybePushAuthenticatedHomeCompactChatRoute(): void {
  const widthPx = readAuthenticatedHomeLayoutWidthPx(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );
  if (isAuthenticatedHomeWideLayoutWidthPx(widthPx)) return;
  if (typeof window !== "undefined" && window.location.pathname === COMPACT_CHAT_PATH) {
    return;
  }
  router.push(COMPACT_CHAT_PATH);
}
