/** Scroll-column near-top → archive folder reveal (see HomeAuthenticatedScreen). */
let handler: (() => void) | null = null;

export function setChatListNearTopHandler(next: (() => void) | null): void {
  handler = next;
}

export function invokeChatListNearTop(): void {
  handler?.();
}
