import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  PanResponder,
  Platform,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";

import {
  SCROLL_INDICATOR_DRAG_HIT_INSET_PX,
  scrollOffsetFromThumbPosition,
} from "../scrollIndicatorPx";
import { layout } from "../theme";

const SCROLL_INDICATOR_DRAG_Z_INDEX = layout.authenticatedHome.scrollIndicatorOverlayZIndex + 1;

type Axis = "horizontal" | "vertical";

type Props = {
  axis: Axis;
  /** Track size along the scroll axis (px). */
  trackSpan: number;
  /** Thumb size along the scroll axis (px). */
  thumbSpan: number;
  /** Thumb offset from the track start (px). */
  thumbOffset: number;
  /** Max scroll offset in the scrolled content (px). */
  scrollRange: number;
  onScrollTo: (offset: number) => void;
  /** ± inset perpendicular to scroll axis; default {@link SCROLL_INDICATOR_DRAG_HIT_INSET_PX}. */
  crossAxisHitInsetPx?: number;
  /** Visible thumb thickness perpendicular to scroll axis (px). */
  crossAxisVisualSpan?: number;
  children: ReactNode;
};

function clearBrowserTextSelection() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const sel = window.getSelection?.();
  sel?.removeAllRanges?.();
}

function setDocumentDragSelectLock(locked: boolean) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const root = document.documentElement;
  if (locked) {
    root.style.setProperty("user-select", "none");
    root.style.setProperty("-webkit-user-select", "none");
    clearBrowserTextSelection();
  } else {
    root.style.removeProperty("user-select");
    root.style.removeProperty("-webkit-user-select");
  }
}

/**
 * Unified scroll-indicator interaction: drag the thumb or press the track to jump.
 *
 * Use this for every custom HSP scroll thumb (vertical via {@link HspVerticalScrollIndicator},
 * or horizontal overlays in nav / tariff / AI strips). Parents must use
 * `pointerEvents="box-none"` so this handle can receive hits; never wrap it in `"none"`.
 *
 * Expands the hit target ±3px on the cross axis (left/right for vertical, up/down for horizontal).
 */
export function ScrollIndicatorDragHandle({
  axis,
  trackSpan,
  thumbSpan,
  thumbOffset,
  scrollRange,
  onScrollTo,
  crossAxisHitInsetPx = SCROLL_INDICATOR_DRAG_HIT_INSET_PX,
  crossAxisVisualSpan = 1,
  children,
}: Props) {
  const trackOriginRef = useRef(0);
  const grabAlongTrackRef = useRef(0);
  const trackRef = useRef<View>(null);
  const draggingRef = useRef(false);

  const thumbOffsetRef = useRef(thumbOffset);
  const thumbSpanRef = useRef(thumbSpan);
  const trackSpanRef = useRef(trackSpan);
  const scrollRangeRef = useRef(scrollRange);
  const onScrollToRef = useRef(onScrollTo);

  thumbOffsetRef.current = thumbOffset;
  thumbSpanRef.current = thumbSpan;
  trackSpanRef.current = trackSpan;
  scrollRangeRef.current = scrollRange;
  onScrollToRef.current = onScrollTo;

  const endDragSelectLock = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDocumentDragSelectLock(false);
  }, []);

  useEffect(() => () => endDragSelectLock(), [endDragSelectLock]);

  const measureTrackOrigin = useCallback(() => {
    trackRef.current?.measureInWindow((x, y) => {
      trackOriginRef.current = axis === "vertical" ? y : x;
    });
  }, [axis]);

  const onTrackLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      measureTrackOrigin();
    },
    [measureTrackOrigin],
  );

  const applyThumbPosition = useCallback((thumbPos: number) => {
    onScrollToRef.current(
      scrollOffsetFromThumbPosition(
        thumbPos,
        trackSpanRef.current,
        thumbSpanRef.current,
        scrollRangeRef.current,
      ),
    );
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => scrollRangeRef.current > 0,
        onMoveShouldSetPanResponder: () => scrollRangeRef.current > 0,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          draggingRef.current = true;
          setDocumentDragSelectLock(true);
          measureTrackOrigin();
          const page = axis === "vertical" ? evt.nativeEvent.pageY : evt.nativeEvent.pageX;
          const alongTrack = page - trackOriginRef.current;
          const thumbStart = thumbOffsetRef.current;
          const thumbEnd = thumbStart + thumbSpanRef.current;
          // Press on the empty track: jump so the thumb centers under the pointer, then drag.
          if (alongTrack < thumbStart || alongTrack > thumbEnd) {
            const jumped = alongTrack - thumbSpanRef.current / 2;
            applyThumbPosition(jumped);
            grabAlongTrackRef.current = thumbSpanRef.current / 2;
            return;
          }
          grabAlongTrackRef.current = alongTrack - thumbOffsetRef.current;
        },
        onPanResponderMove: (evt) => {
          if (Platform.OS === "web") clearBrowserTextSelection();
          const page = axis === "vertical" ? evt.nativeEvent.pageY : evt.nativeEvent.pageX;
          const thumbPos = page - trackOriginRef.current - grabAlongTrackRef.current;
          applyThumbPosition(thumbPos);
        },
        onPanResponderRelease: () => endDragSelectLock(),
        onPanResponderTerminate: () => endDragSelectLock(),
      }),
    [axis, measureTrackOrigin, endDragSelectLock, applyThumbPosition],
  );

  if (scrollRange <= 0 || thumbSpan <= 0 || trackSpan <= 0) {
    return null;
  }

  const inset = crossAxisHitInsetPx;
  const webDragStyle =
    Platform.OS === "web"
      ? ({
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        } as unknown as ViewStyle)
      : null;

  // Full-track hit area so press-to-jump works; thumb visual sits inside at thumbOffset.
  const handleStyle: ViewStyle =
    axis === "vertical"
      ? {
          position: "absolute",
          right: -inset,
          top: 0,
          width: crossAxisVisualSpan + inset * 2,
          height: trackSpan,
          zIndex: SCROLL_INDICATOR_DRAG_Z_INDEX,
          ...webDragStyle,
        }
      : {
          position: "absolute",
          left: 0,
          top: -inset,
          width: trackSpan,
          height: crossAxisVisualSpan + inset * 2,
          zIndex: SCROLL_INDICATOR_DRAG_Z_INDEX,
          ...webDragStyle,
        };

  const visualWrapStyle: ViewStyle =
    axis === "vertical"
      ? {
          position: "absolute",
          right: inset,
          top: thumbOffset,
          width: crossAxisVisualSpan,
          height: thumbSpan,
          overflow: "visible",
        }
      : {
          position: "absolute",
          left: thumbOffset,
          top: inset,
          width: thumbSpan,
          height: crossAxisVisualSpan,
          overflow: "visible",
        };

  const trackProbeStyle: ViewStyle =
    axis === "vertical"
      ? { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }
      : { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 };

  return (
    <>
      <View ref={trackRef} pointerEvents="none" style={trackProbeStyle} onLayout={onTrackLayout} />
      <View
        {...panResponder.panHandlers}
        pointerEvents="auto"
        style={handleStyle}
        collapsable={false}
        accessibilityRole="adjustable"
        accessibilityLabel="Scroll"
      >
        <View pointerEvents="none" style={visualWrapStyle}>
          {children}
        </View>
      </View>
    </>
  );
}
