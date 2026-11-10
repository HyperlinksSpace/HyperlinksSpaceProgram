import { router } from "expo-router";
import { logPageDisplay } from "./pageDisplayLog";
import { readAuthenticatedHomeCompactChatLayoutSync } from "./authenticatedHomeLayoutWidth";

const COMPACT_CHAT_PATH = "/messages/chat";

/** Set by {@link openAuthenticatedHomeChatHistory} — blocks restore-driven route pushes. */
let compactChatRouteUserIntent = false;
/**
 * `router.navigate` does not update `location.pathname` until the next frame.
 * A second push in that gap stacks another `/messages/chat` card on the home
 * screen. iOS Telegram WebView fails when those cards stay mounted together.
 */
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
  const go = (source: "sync" | "replace") => {
    if (isOnCompactChatPath()) {
      compactChatRoutePushPending = false;
      return;
    }
    try {
      const navigate =
        "navigate" in router && typeof router.navigate === "function"
          ? (path: string) => router.navigate(path)
          : null;
      if (source === "replace") {
        if (navigate) navigate(COMPACT_CHAT_PATH);
        else router.replace(COMPACT_CHAT_PATH);
        logPageDisplay("messages_compact_chat_route_replace", { path: COMPACT_CHAT_PATH, source });
      } else if (navigate) {
        navigate(COMPACT_CHAT_PATH);
        logPageDisplay("messages_compact_chat_route_push", { path: COMPACT_CHAT_PATH, source });
      } else {
        router.push(COMPACT_CHAT_PATH);
        logPageDisplay("messages_compact_chat_route_push", { path: COMPACT_CHAT_PATH, source });
      }
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
      go("replace");
    }, 400);
  }
}
