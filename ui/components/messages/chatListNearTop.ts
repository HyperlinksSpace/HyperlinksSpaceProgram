/** Scroll-column near-top → archive folder reveal (see HomeAuthenticatedScreen). */
let handler: (() => void) | null = null;
/** Clears HomeAuthenticatedScreen's one-shot archive latch after ordered reseed. */
let latchResetHandler: (() => void) | null = null;

export function setChatListNearTopHandler(next: (() => void) | null): void {
  handler = next;
}

export function invokeChatListNearTop(): void {
  handler?.();
}

export function setChatListArchiveRevealLatchResetHandler(next: (() => void) | null): void {
  latchResetHandler = next;
}

export function resetChatListArchiveRevealLatch(): void {
  latchResetHandler?.();
}
