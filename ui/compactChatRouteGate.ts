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
