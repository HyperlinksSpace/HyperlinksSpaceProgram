/** Ctrl/Cmd + wheel or trackpad pinch — browser page zoom, not column scroll. */
export function isBrowserZoomWheelEvent(event: Pick<WheelEvent, "ctrlKey" | "metaKey">): boolean {
  return event.ctrlKey || event.metaKey;
}

/** Pinch zoom enlarged the layout beyond 100% (visualViewport API). */
export function isBrowserPageZoomed(): boolean {
  if (typeof window === "undefined") return false;
  const viewport = window.visualViewport;
  return viewport != null && Math.abs(viewport.scale - 1) > 0.01;
}

export type SyncWebDocumentOverflowOptions = {
  /**
   * Narrow full-screen open chat (`compactChatOpen`): lock the document so only the in-app
   * {@link HspScrollColumn} scrollport + custom thumb are active — not a second UA scrollbar.
   * When false, zoom still enables document `overflow: auto` for panning zoomed pages.
   */
  lockDocumentScroll?: boolean;
};

export function syncWebDocumentOverflowForZoom(
  options?: SyncWebDocumentOverflowOptions,
): void {
  if (typeof document === "undefined") return;
  const lock = options?.lockDocumentScroll === true;
  const overflow = lock || !isBrowserPageZoomed() ? "hidden" : "auto";
  document.documentElement.style.overflow = overflow;
  document.body.style.overflow = overflow;
  const root = document.getElementById("root") ?? document.querySelector("[data-expo-root]");
  if (root instanceof HTMLElement) root.style.overflow = overflow;
}
