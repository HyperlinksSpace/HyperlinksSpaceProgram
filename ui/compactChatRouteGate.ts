import { readAuthenticatedHomeCompactChatLayoutSync } from "./authenticatedHomeLayoutWidth";
import { logPageDisplay } from "./pageDisplayLog";

/** Set while `MessageChatCompactScreen` is mounted — pathname can lag on mobile TMA. */
let compactChatRouteUiOpen = false;

export function setCompactChatRouteUiOpen(open: boolean): void {
  compactChatRouteUiOpen = open;
}

export function isCompactChatRouteUiOpen(): boolean {
  return compactChatRouteUiOpen;
}

export function isOnMessagesChatPath(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/$/, "");
  return path === "/messages/chat" || path.endsWith("/messages/chat");
}

/** Compact full-screen chat is active (route or UI latch). */
export function isCompactChatRouteActive(): boolean {
  return compactChatRouteUiOpen || isOnMessagesChatPath();
}

/** One-column compact chat open — keep list polls/SSE off the gateway until back. */
export function shouldPauseChatListUpdatesInCompactChat(): boolean {
  return (
    readAuthenticatedHomeCompactChatLayoutSync() && isCompactChatRouteActive()
  );
}

/**
 * iOS TMA: do not call `fetch` for open history until the compact chat screen
 * has mounted and the pathname is `/messages/chat` (same stable host as the
 * chat list GET on home).
 */
async function settleCompactChatRoutePaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export async function waitForIosCompactHistoryFetchReady(): Promise<void> {
  if (isOnMessagesChatPath()) {
    await settleCompactChatRoutePaint();
    return;
  }
  if (compactChatRouteUiOpen) {
    await settleCompactChatRoutePaint();
    return;
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (isOnMessagesChatPath() || compactChatRouteUiOpen) {
      await settleCompactChatRoutePaint();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 32));
  }
  logPageDisplay("messages_history_ios_route_wait_timeout", {
    uiOpen: compactChatRouteUiOpen,
    onPath: isOnMessagesChatPath(),
  });
}
