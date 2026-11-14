import { readAuthenticatedHomeCompactChatLayoutSync } from "./authenticatedHomeLayoutWidth";

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
export async function waitForIosCompactHistoryFetchReady(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (compactChatRouteUiOpen && isOnMessagesChatPath()) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 32));
  }
}
