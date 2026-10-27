import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { isBrowserZoomWheelEvent } from "../../browserZoom";
import { SCROLL_INDICATOR_SCROLL_EPS } from "../../scrollIndicatorPx";

type ScrollMetrics = { scrollY: number };

/**
 * Collapsible search above a sticky table legend — mirrors compact home header/nav:
 * scroll down tucks search; past the collapse range, pull the legend to tear search back.
 */
export function useChooseCurrencySearchChrome(
  enabled: boolean,
  searchBlockHeightPx: number,
  scrollY: number,
  scrollToY: (y: number) => void,
  getScrollMetrics: () => ScrollMetrics,
) {
  const [tearRevealPx, setTearRevealPx] = useState(0);
  const scrollYRef = useRef(scrollY);
  const tearRevealPxRef = useRef(0);
  const dragStartYRef = useRef<number | null>(null);
  const dragStartScrollRef = useRef(0);
  const dragStartTearRef = useRef(0);
  const gestureActiveRef = useRef(false);
  const didDragRef = useRef(false);

  useEffect(() => {
    scrollYRef.current = scrollY;
  }, [scrollY]);

  useEffect(() => {
    tearRevealPxRef.current = tearRevealPx;
  }, [tearRevealPx]);

  const collapseLockPx = enabled ? searchBlockHeightPx : 0;
  const collapseFromScroll = enabled
    ? Math.min(searchBlockHeightPx, Math.max(0, scrollY))
    : 0;
  const visibleSearchPx = enabled
    ? Math.min(
        searchBlockHeightPx,
        Math.max(0, searchBlockHeightPx - collapseFromScroll + tearRevealPx),
      )
    : 0;
  const usePullDrawer =
    enabled && collapseLockPx > 0 && scrollY >= collapseLockPx - SCROLL_INDICATOR_SCROLL_EPS;

  const clampTear = useCallback(
    (value: number) => Math.max(0, Math.min(searchBlockHeightPx, value)),
    [searchBlockHeightPx],
  );

  useEffect(() => {
    if (!enabled) {
      setTearRevealPx(0);
    }
  }, [enabled]);

  const onLegendTouchStart = useCallback(
    (pageY: number) => {
      if (!enabled || searchBlockHeightPx <= 0) return;
      dragStartYRef.current = pageY;
      dragStartScrollRef.current = getScrollMetrics().scrollY;
      dragStartTearRef.current = tearRevealPxRef.current;
      didDragRef.current = false;
      gestureActiveRef.current = true;
    },
    [enabled, getScrollMetrics, searchBlockHeightPx],
  );

  const onLegendTouchMove = useCallback(
    (pageY: number, preventDefault?: () => void) => {
      if (!enabled || dragStartYRef.current == null) return;
      const dy = pageY - dragStartYRef.current;
      if (Math.abs(dy) < 4) return;
      didDragRef.current = true;
      const lock = collapseLockPx;
      const startScroll = dragStartScrollRef.current;
      if (lock > 0 && startScroll < lock) {
        scrollToY(Math.max(0, Math.min(lock, startScroll - dy)));
        setTearRevealPx(0);
        return;
      }
      preventDefault?.();
      scrollToY(startScroll);
      setTearRevealPx(clampTear(dragStartTearRef.current + dy));
    },
    [clampTear, collapseLockPx, enabled, scrollToY],
  );

  const onLegendTouchEnd = useCallback(() => {
    if (!enabled) return;
    if (didDragRef.current) {
      const lock = collapseLockPx;
      const startScroll = dragStartScrollRef.current;
      const y = getScrollMetrics().scrollY;
      if (lock > 0 && startScroll < lock) {
        scrollToY(y < lock / 2 ? 0 : lock);
        setTearRevealPx(0);
      } else if (searchBlockHeightPx > 0) {
        scrollToY(startScroll);
        const mid = searchBlockHeightPx / 2;
        setTearRevealPx((prev) => (prev >= mid ? searchBlockHeightPx : 0));
      }
    }
    dragStartYRef.current = null;
    didDragRef.current = false;
    gestureActiveRef.current = false;
  }, [collapseLockPx, enabled, getScrollMetrics, scrollToY, searchBlockHeightPx]);

  const onLegendWheel = useCallback(
    (event: {
      nativeEvent?: { deltaY?: number; ctrlKey?: boolean; metaKey?: boolean };
      preventDefault?: () => void;
    }) => {
      if (!enabled || !usePullDrawer) return;
      const native =
        event.nativeEvent ??
        (event as unknown as { deltaY?: number; ctrlKey?: boolean; metaKey?: boolean });
      if (
        isBrowserZoomWheelEvent({
          ctrlKey: Boolean(native.ctrlKey),
          metaKey: Boolean(native.metaKey),
        })
      ) {
        return;
      }
      const dy = typeof native.deltaY === "number" ? native.deltaY : 0;
      if (dy === 0) return;
      event.preventDefault?.();
      const lock = collapseLockPx;
      const y = getScrollMetrics().scrollY;
      if (lock > 0 && y < lock) {
        scrollToY(Math.max(0, Math.min(lock, y + dy)));
        setTearRevealPx(0);
        return;
      }
      scrollToY(y);
      setTearRevealPx((prev) => clampTear(prev - dy));
    },
    [clampTear, collapseLockPx, enabled, getScrollMetrics, scrollToY, usePullDrawer],
  );

  const consumeScrollCollapse = useCallback(
    (nextScrollY: number, prevScrollY: number) => {
      if (!enabled || searchBlockHeightPx <= 0) return;
      if (
        !gestureActiveRef.current &&
        nextScrollY > prevScrollY + 2 &&
        tearRevealPxRef.current > 0
      ) {
        setTearRevealPx(0);
      }
      if (gestureActiveRef.current && collapseLockPx > 0) {
        const pinned = dragStartScrollRef.current;
        if (pinned >= collapseLockPx && Math.abs(nextScrollY - pinned) > 0.5) {
          scrollToY(pinned);
        }
      }
    },
    [collapseLockPx, enabled, scrollToY, searchBlockHeightPx],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const blockTouchMove = (e: TouchEvent) => {
      if (!gestureActiveRef.current) return;
      const lock = collapseLockPx;
      const startScroll = dragStartScrollRef.current;
      if (!(lock > 0 && startScroll >= lock)) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", blockTouchMove, { passive: false, capture: true });
    return () => document.removeEventListener("touchmove", blockTouchMove, true);
  }, [collapseLockPx]);

  return {
    visibleSearchPx,
    stickyChromeHeightPx: visibleSearchPx,
    usePullDrawer,
    onLegendTouchStart,
    onLegendTouchMove,
    onLegendTouchEnd,
    onLegendWheel,
    consumeScrollCollapse,
  };
}
