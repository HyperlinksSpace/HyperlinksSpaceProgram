import { router } from "expo-router";
import { logPageDisplay } from "./pageDisplayLog";
import { readAuthenticatedHomeCompactChatLayoutSync } from "./authenticatedHomeLayoutWidth";
import { setCompactChatRouteUiOpen } from "./compactChatRouteGate";

const COMPACT_CHAT_PATH = "/messages/chat";

/** Set by {@link openAuthenticatedHomeChatHistory} — blocks restore-driven route pushes. */
let compactChatRouteUserIntent = false;
/** Guards duplicate replace while the route is settling. */
let compactChatRoutePushPending = false;

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
    compactChatRoutePushPending = false;
    return;
  }
  if (compactChatRoutePushPending) {
    logPageDisplay("messages_compact_chat_route_skip", { reason: "push_pending" });
    return;
  }
  const go = (source: "sync" | "retry") => {
    if (isOnCompactChatPath()) {
      compactChatRoutePushPending = false;
      return;
    }
    try {
      // Always replace: keep a single screen card so home panels/network do not
      // stay mounted under compact chat (iOS Telegram WebView stalls otherwise).
      router.replace(COMPACT_CHAT_PATH);
      setCompactChatRouteUiOpen(true);
      logPageDisplay("messages_compact_chat_route_replace", { path: COMPACT_CHAT_PATH, source });
    } catch (error) {
      compactChatRoutePushPending = false;
      logPageDisplay("messages_compact_chat_route_push_error", {
        path: COMPACT_CHAT_PATH,
        source,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  compactChatRoutePushPending = true;
  go("sync");
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if (isOnCompactChatPath()) {
        compactChatRoutePushPending = false;
        return;
      }
      compactChatRoutePushPending = true;
      go("retry");
    }, 120);
  }
}
