import { router } from "expo-router";
import { logPageDisplay } from "./pageDisplayLog";
import { readAuthenticatedHomeCompactChatLayoutSync } from "./authenticatedHomeLayoutWidth";

const COMPACT_CHAT_PATH = "/messages/chat";

/** Set by {@link openAuthenticatedHomeChatHistory} — blocks restore-driven route pushes. */
let compactChatRouteUserIntent = false;

export function allowAuthenticatedHomeCompactChatRoutePush(): void {
  compactChatRouteUserIntent = true;
}

export function clearAuthenticatedHomeCompactChatRoutePushIntent(): void {
  compactChatRouteUserIntent = false;
}

export function isAuthenticatedHomeCompactChatRoutePushIntent(): boolean {
  return compactChatRouteUserIntent;
}

function isOnCompactChatPath(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  return path === COMPACT_CHAT_PATH || path.endsWith(COMPACT_CHAT_PATH);
}

/** After `openAuthenticatedHomeChatHistory`, open the full-screen chat route on narrow home. */
export function maybePushAuthenticatedHomeCompactChatRoute(): void {
  if (!compactChatRouteUserIntent) {
    logPageDisplay("messages_compact_chat_route_skip", { reason: "no_user_intent" });
    return;
  }
  if (!readAuthenticatedHomeCompactChatLayoutSync()) {
    logPageDisplay("messages_compact_chat_route_skip", { reason: "layout_not_compact" });
    return;
  }
  if (isOnCompactChatPath()) {
    return;
  }
  const go = () => {
    if (isOnCompactChatPath()) return;
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
  // Mobile TMA: push in the same tap gesture; do not defer solely to rAF.
  go();
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(go);
  }
  if (typeof window !== "undefined") {
    window.setTimeout(go, 120);
  }
}
