import { router } from "expo-router";
import { logPageDisplay } from "./pageDisplayLog";
import { readAuthenticatedHomeCompactChatLayoutSync } from "./authenticatedHomeLayoutWidth";

const COMPACT_CHAT_PATH = "/messages/chat";

/** After `openAuthenticatedHomeChatHistory`, open the full-screen chat route on narrow home. */
export function maybePushAuthenticatedHomeCompactChatRoute(): void {
  if (!readAuthenticatedHomeCompactChatLayoutSync()) {
    logPageDisplay("messages_compact_chat_route_skip", { reason: "layout_not_compact" });
    return;
  }
  if (typeof window !== "undefined" && window.location.pathname === COMPACT_CHAT_PATH) {
    return;
  }
  const go = () => {
    try {
      router.push(COMPACT_CHAT_PATH);
      logPageDisplay("messages_compact_chat_route_push", { path: COMPACT_CHAT_PATH });
    } catch (error) {
      logPageDisplay("messages_compact_chat_route_push_error", {
        path: COMPACT_CHAT_PATH,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(go);
  } else {
    go();
  }
}
