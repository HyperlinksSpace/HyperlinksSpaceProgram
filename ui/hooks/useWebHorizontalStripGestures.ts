import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { Platform } from "react-native";

export type WebHorizontalStripPickScrollEl = (root: HTMLElement) => HTMLElement | null;

type Options = {
  /** Host that wraps the horizontal ScrollView (web DOM node). */
  rootRef: RefObject<unknown> | MutableRefObject<unknown>;
  /** When false, wheel/drag are idle (content fits). */
  overflows: boolean;
  /** Resolve the real overflow:auto node under {@link rootRef}. */
  pickScrollEl: WebHorizontalStripPickScrollEl;
  /** Sync React scroll thumb / metrics after DOM scrollLeft changes. */
  onScrollX?: (x: number) => void;
  /**
   * Set true while drag-scrolling so the following synthetic click does not
   * activate a tab/card Pressable.
   */
  suppressPressRef?: MutableRefObject<boolean>;
  /**
   * When the strip cannot scroll further on a vertical-dominant wheel, forward
   * deltaY to the nearest parent vertical scroller (Pro dialog body).
   */
  forwardUnusedWheelToParentVertical?: boolean;
};

function asHtmlElement(ref: RefObject<unknown> | MutableRefObject<unknown>): HTMLElement | null {
  const raw = ref.current as
    | HTMLElement
    | { getNode?: () => unknown; _nativeNode?: HTMLElement }
    | null;
  if (!raw) return null;
  if (typeof HTMLElement !== "undefined" && raw instanceof HTMLElement) return raw;
  const node = raw.getNode?.() ?? raw._nativeNode ?? null;
  return node instanceof HTMLElement ? node : null;
}

function findParentVerticalScrollEl(from: HTMLElement): HTMLElement | null {
  let n: HTMLElement | null = from.parentElement;
  while (n) {
    const style = typeof window !== "undefined" ? window.getComputedStyle(n) : null;
    const oy = style?.overflowY ?? "";
    const canScroll =
      n.scrollHeight > n.clientHeight + 2 &&
      (oy === "auto" ||
        oy === "scroll" ||
        oy === "overlay" ||
        n.classList.contains("hsp-scroll-column-overscroll-contain"));
    if (canScroll) return n;
    n = n.parentElement;
  }
  return null;
}

function setDocumentDragSelectLock(locked: boolean) {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style as CSSStyleDeclaration & {
    webkitUserSelect?: string;
  };
  if (locked) {
    style.userSelect = "none";
    style.webkitUserSelect = "none";
  } else {
    style.userSelect = "";
    style.webkitUserSelect = "";
  }
}

/**
 * Web-only: mouse wheel scrolls a horizontal strip (deltaY → scrollLeft), and
 * click-drag pans the same strip. Use on AI tabs, Feed nav, Pro tariffs, etc.
 */
export function useWebHorizontalStripGestures({
  rootRef,
  overflows,
  pickScrollEl,
  onScrollX,
  suppressPressRef,
  forwardUnusedWheelToParentVertical = false,
}: Options): { grabbing: boolean } {
  const [grabbing, setGrabbing] = useState(false);
  const onScrollXRef = useRef(onScrollX);
  onScrollXRef.current = onScrollX;
  const pickScrollElRef = useRef(pickScrollEl);
  pickScrollElRef.current = pickScrollEl;
  const overflowsRef = useRef(overflows);
  overflowsRef.current = overflows;
  const forwardRef = useRef(forwardUnusedWheelToParentVertical);
  forwardRef.current = forwardUnusedWheelToParentVertical;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let cancelled = false;
    let rafId = 0;
    let attempts = 0;
    let attachedRoot: HTMLElement | null = null;

    const onWheel = (e: WheelEvent) => {
      const root = attachedRoot;
      if (!root) return;
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      if (absX < 0.5 && absY < 0.5) return;

      const hScroll = pickScrollElRef.current(root);
      const canH = overflowsRef.current && hScroll != null;
      // Prefer trackpad deltaX when present; otherwise map mouse-wheel deltaY → horizontal.
      const delta = absX > absY + 0.25 ? e.deltaX : e.deltaY;

      if (canH && hScroll) {
        const max = Math.max(0, hScroll.scrollWidth - hScroll.clientWidth);
        const next = Math.max(0, Math.min(max, hScroll.scrollLeft + delta));
        if (next !== hScroll.scrollLeft) {
          e.preventDefault();
          e.stopPropagation();
          hScroll.scrollLeft = next;
          onScrollXRef.current?.(Math.round(next));
          return;
        }
        // At an edge: keep the strip from stealing vertical dialog/page scroll when asked.
        if (forwardRef.current && absY >= absX) {
          const parent = findParentVerticalScrollEl(root);
          if (parent) {
            e.preventDefault();
            e.stopPropagation();
            parent.scrollTop += e.deltaY !== 0 ? e.deltaY : e.deltaX;
            return;
          }
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (forwardRef.current) {
        const parent = findParentVerticalScrollEl(root);
        if (!parent) return;
        e.preventDefault();
        e.stopPropagation();
        parent.scrollTop += e.deltaY !== 0 ? e.deltaY : e.deltaX;
      }
    };

    const attach = () => {
      if (cancelled) return;
      const root = asHtmlElement(rootRef);
      if (!root) {
        attempts += 1;
        if (attempts < 24) rafId = requestAnimationFrame(attach);
        return;
      }
      attachedRoot = root;
      root.addEventListener("wheel", onWheel, { passive: false, capture: true });
    };
    attach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      attachedRoot?.removeEventListener("wheel", onWheel, true);
    };
  }, [rootRef, overflows]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !overflows) return;
    let cancelled = false;
    let rafId = 0;
    let attempts = 0;
    let attachedRoot: HTMLElement | null = null;

    const ACTIVATE_DX_PX = 8;
    let tracking = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let pointerId: number | null = null;
    let host: HTMLElement | null = null;

    const resolveScroll = () =>
      attachedRoot ? pickScrollElRef.current(attachedRoot) : null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button != null && e.button !== 0) return;
      const el = resolveScroll();
      if (!el) return;
      tracking = true;
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;
      startScroll = el.scrollLeft;
      pointerId = e.pointerId;
      host = e.currentTarget as HTMLElement;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < ACTIVATE_DX_PX && Math.abs(dy) < ACTIVATE_DX_PX) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          tracking = false;
          return;
        }
        dragging = true;
        setGrabbing(true);
        setDocumentDragSelectLock(true);
        if (suppressPressRef) suppressPressRef.current = true;
        try {
          host?.setPointerCapture?.(pointerId ?? e.pointerId);
        } catch {
          /* ignore */
        }
      }
      e.preventDefault();
      const el = resolveScroll();
      if (!el) return;
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      const next = Math.max(0, Math.min(max, startScroll - dx));
      el.scrollLeft = next;
      onScrollXRef.current?.(Math.round(next));
    };

    const endDrag = () => {
      if (!tracking && !dragging) return;
      tracking = false;
      if (dragging) {
        dragging = false;
        setGrabbing(false);
        setDocumentDragSelectLock(false);
        window.setTimeout(() => {
          if (suppressPressRef) suppressPressRef.current = false;
        }, 0);
      }
      try {
        if (host && pointerId != null) host.releasePointerCapture?.(pointerId);
      } catch {
        /* ignore */
      }
      host = null;
      pointerId = null;
    };

    const attach = () => {
      if (cancelled) return;
      const root = asHtmlElement(rootRef);
      if (!root) {
        attempts += 1;
        if (attempts < 24) rafId = requestAnimationFrame(attach);
        return;
      }
      attachedRoot = root;
      root.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    };
    attach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      attachedRoot?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      setDocumentDragSelectLock(false);
      setGrabbing(false);
    };
  }, [overflows, rootRef, suppressPressRef]);

  return { grabbing };
}
