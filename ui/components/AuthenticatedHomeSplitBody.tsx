import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  PanResponder,
  PixelRatio,
  Platform,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { logPageDisplay } from "../pageDisplayLog";
import { layout, useColors } from "../theme";

const AH = layout.authenticatedHome;

/** Left offset of the 1px stroke inside the divider hit strip (row X of stroke = `leftPanePx` + this). */
const SPLIT_PANE_LINE_LEFT_IN_HIT = Math.max(
  0,
  Math.floor((AH.splitPaneDividerHitWidthPx - AH.splitPaneDividerStrokePx) / 2),
);

/**
 * Snap first-column width so the stroke seam sits on device pixels (web: `devicePixelRatio`; native: layout px).
 * Applied on drag start, each move, release/terminate, and clamp-after-layout.
 */
function snapLeftPaneToDeviceSeam(leftPane: number, dpr: number, lo: number, hi: number): number {
  if (Platform.OS === "web") {
    const seam = leftPane + SPLIT_PANE_LINE_LEFT_IN_HIT;
    const seamSnapped = Math.round(seam * dpr) / dpr;
    const next = Math.round(seamSnapped - SPLIT_PANE_LINE_LEFT_IN_HIT);
    return clamp(next, lo, hi);
  }
  return clamp(PixelRatio.roundToNearestPixel(leftPane), lo, hi);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function maxLeftForRow(rw: number): number {
  return Math.min(
    AH.splitPaneMaxFirstColumnPx,
    rw - AH.splitPaneDividerHitWidthPx - AH.splitPaneMinSecondColumnPx,
  );
}

type Props = {
  /** Primary content; full width when `row ≤ firstBreakpoint`, fixed-width column when wider. */
  left: ReactNode;
  /** Secondary pane when `row > firstBreakpoint`; hidden on narrow layouts. */
  right: ReactNode;
};

/**
 * Full-bleed row under the authenticated header: one column below `firstBreakpoint`, two
 * columns above it with a draggable highlight divider (mouse: `col-resize`, touch: drag).
 */
export function AuthenticatedHomeSplitBody({ left, right }: Props) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState(0);
  const [leftPanePx, setLeftPanePx] = useState(AH.splitPaneDefaultFirstColumnPx);

  const isWideRef = useRef(false);
  const rowWidthRef = useRef(0);
  const leftPaneRef = useRef(AH.splitPaneDefaultFirstColumnPx);
  const dragStartLeftRef = useRef(AH.splitPaneDefaultFirstColumnPx);
  /** Screen X at drag start (web pointer path; PanResponder uses built-in dx). */
  const pointerStartXRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const webDragActiveRef = useRef(false);
  const lastLoggedMoveKeyRef = useRef<string>("");
  const useWindowWidthRef = useRef(windowWidth);
  useWindowWidthRef.current = windowWidth;

  /** DOM node for `setPointerCapture` (web); set via ref + `currentTarget` on pointer down. */
  const webDividerHostRef = useRef<HTMLElement | null>(null);

  const dprRef = useRef(1);
  dprRef.current =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.devicePixelRatio || PixelRatio.get()
      : PixelRatio.get();

  useEffect(() => {
    leftPaneRef.current = leftPanePx;
  }, [leftPanePx]);

  useEffect(() => {
    rowWidthRef.current = rowWidth;
  }, [rowWidth]);

  const effectiveWidth = rowWidth > 0 ? rowWidth : windowWidth;
  const isWide = effectiveWidth > AH.firstBreakpoint;
  isWideRef.current = isWide;

  useEffect(() => {
    if (!rowWidth || !isWide) return;
    const cap = maxLeftForRow(rowWidth);
    if (cap < AH.splitPaneMinFirstColumnPx) return;
    setLeftPanePx((w) => {
      const c = clamp(w, AH.splitPaneMinFirstColumnPx, cap);
      const s = snapLeftPaneToDeviceSeam(c, dprRef.current, AH.splitPaneMinFirstColumnPx, cap);
      if (s !== w) {
        logPageDisplay("home_split_pane_clamp_effect", {
          prevLeftPx: w,
          nextLeftPx: s,
          cap,
          rowWidth,
          minLeftPx: AH.splitPaneMinFirstColumnPx,
        });
      }
      return s;
    });
  }, [rowWidth, isWide]);

  const grantDrag = useCallback((inputKind: "pointer" | "pan_responder") => {
    lastLoggedMoveKeyRef.current = "";
    const rw = rowWidthRef.current;
    const cap = rw > 0 ? maxLeftForRow(rw) : 0;
    const lo = AH.splitPaneMinFirstColumnPx;
    let start = leftPaneRef.current;
    if (rw && cap >= lo) {
      const snapped = snapLeftPaneToDeviceSeam(start, dprRef.current, lo, cap);
      if (snapped !== start) {
        start = snapped;
        leftPaneRef.current = snapped;
        dragStartLeftRef.current = snapped;
        setLeftPanePx(snapped);
      }
    }
    dragStartLeftRef.current = start;
    logPageDisplay("home_split_pane_drag", {
      phase: "grant",
      dragStartLeftPx: dragStartLeftRef.current,
      rowWidthPx: rw,
      capLeftPx: cap,
      useWindowDimensionsWidthPx: useWindowWidthRef.current,
      isWide: isWideRef.current,
      dpr: dprRef.current,
      input: inputKind,
    });
  }, []);

  const moveDragByDx = useCallback((dx: number, vx: number) => {
    const rw = rowWidthRef.current;
    if (!rw || !isWideRef.current) {
      logPageDisplay("home_split_pane_drag", {
        phase: "move_skip",
        reason: !rw ? "row_width_zero" : "not_wide",
        dx,
        vx,
      });
      return;
    }
    const cap = maxLeftForRow(rw);
    if (cap < AH.splitPaneMinFirstColumnPx) {
      logPageDisplay("home_split_pane_drag", { phase: "move_skip", reason: "cap_below_min", cap });
      return;
    }
    const lo = AH.splitPaneMinFirstColumnPx;
    const raw = dragStartLeftRef.current + dx;
    const nextRounded = Math.round(clamp(raw, lo, cap));
    const next = snapLeftPaneToDeviceSeam(nextRounded, dprRef.current, lo, cap);
    const key = `${dx.toFixed(1)}|${raw.toFixed(1)}|${next}`;
    if (key !== lastLoggedMoveKeyRef.current) {
      lastLoggedMoveKeyRef.current = key;
      logPageDisplay("home_split_pane_drag", {
        phase: "move",
        dx,
        vx,
        rawLeftPx: raw,
        nextLeftPx: next,
        capLeftPx: cap,
        rowWidthPx: rw,
        dpr: dprRef.current,
        seamCssPx: next + SPLIT_PANE_LINE_LEFT_IN_HIT,
        clampedToMin: next <= lo && raw < lo,
        clampedToMax: next >= cap && raw > cap,
      });
    }
    setLeftPanePx((prev) => (prev === next ? prev : next));
  }, []);

  const endDrag = useCallback(
    (
      phase: "release" | "terminate",
      totalDx: number,
      totalVx: number,
      inputKind: "pointer" | "pan_responder",
    ) => {
      const rw = rowWidthRef.current;
      const cap = rw > 0 ? maxLeftForRow(rw) : 0;
      const lo = AH.splitPaneMinFirstColumnPx;
      const before = leftPaneRef.current;
      const snapped =
        rw && cap >= lo ? snapLeftPaneToDeviceSeam(before, dprRef.current, lo, cap) : before;
      if (snapped !== before) {
        leftPaneRef.current = snapped;
        setLeftPanePx(snapped);
      }
      logPageDisplay("home_split_pane_drag", {
        phase,
        finalLeftPx: snapped,
        snapDeltaPx: snapped - before,
        seamCssPx: snapped + SPLIT_PANE_LINE_LEFT_IN_HIT,
        totalDx,
        totalVx,
        rowWidthPx: rw,
        capLeftPx: cap,
        dpr: dprRef.current,
        input: inputKind,
      });
    },
    [],
  );

  const releasePointerCaptureIfNeeded = useCallback((host: HTMLElement | null) => {
    const pid = activePointerIdRef.current;
    if (pid == null || !host || typeof host.releasePointerCapture !== "function") {
      webDragActiveRef.current = false;
      return;
    }
    try {
      if (host.hasPointerCapture?.(pid)) {
        host.releasePointerCapture(pid);
      }
    } catch {
      /* ignore */
    }
    activePointerIdRef.current = null;
    webDragActiveRef.current = false;
  }, []);

  /** Web only: DOM pointer capture keeps move/up on the divider when Telegram/WebView would end PanResponder early. */
  const handleWebPointerDown = useCallback(
    (e: {
      nativeEvent: { clientX: number; pointerId: number; preventDefault?: () => void };
      currentTarget?: unknown;
    }) => {
      if (!isWideRef.current) return;
      const ne = e.nativeEvent;
      ne.preventDefault?.();
      pointerStartXRef.current = ne.clientX;
      grantDrag("pointer");
      const host = (e.currentTarget ?? webDividerHostRef.current) as HTMLElement | null;
      if (host && typeof host.setPointerCapture === "function" && typeof ne.pointerId === "number") {
        try {
          host.setPointerCapture(ne.pointerId);
          activePointerIdRef.current = ne.pointerId;
          webDividerHostRef.current = host;
        } catch {
          activePointerIdRef.current = null;
        }
      }
      webDragActiveRef.current = true;
    },
    [grantDrag],
  );

  const handleWebPointerMove = useCallback(
    (e: { nativeEvent: { clientX: number } }) => {
      if (!webDragActiveRef.current) return;
      const dx = e.nativeEvent.clientX - pointerStartXRef.current;
      moveDragByDx(dx, 0);
    },
    [moveDragByDx],
  );

  const handleWebPointerUp = useCallback(
    (e: { nativeEvent: { clientX: number } }) => {
      if (!webDragActiveRef.current) return;
      const dx = e.nativeEvent.clientX - pointerStartXRef.current;
      endDrag("release", dx, 0, "pointer");
      releasePointerCaptureIfNeeded(webDividerHostRef.current);
    },
    [endDrag, releasePointerCaptureIfNeeded],
  );

  const handleWebPointerCancel = useCallback(
    (e: { nativeEvent: { clientX: number } }) => {
      if (!webDragActiveRef.current) return;
      const dx = e.nativeEvent.clientX - pointerStartXRef.current;
      endDrag("terminate", dx, 0, "pointer");
      releasePointerCaptureIfNeeded(webDividerHostRef.current);
    },
    [endDrag, releasePointerCaptureIfNeeded],
  );

  const handleWebLostPointerCapture = useCallback(() => {
    if (!webDragActiveRef.current) return;
    logPageDisplay("home_split_pane_drag", {
      phase: "lost_pointer_capture",
      rowWidthPx: rowWidthRef.current,
      isWide: isWideRef.current,
      input: "pointer",
    });
    endDrag("terminate", 0, 0, "pointer");
    activePointerIdRef.current = null;
    webDragActiveRef.current = false;
  }, [endDrag]);

  const webDividerPointerProps =
    Platform.OS === "web"
      ? {
          onPointerDown: handleWebPointerDown,
          onPointerMove: handleWebPointerMove,
          onPointerUp: handleWebPointerUp,
          onPointerCancel: handleWebPointerCancel,
          onLostPointerCapture: handleWebLostPointerCapture,
        }
      : null;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        Platform.OS !== "web" && isWideRef.current,
      onMoveShouldSetPanResponder: (_, g) =>
        Platform.OS !== "web" && isWideRef.current && Math.abs(g.dx) > 0.5,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => Platform.OS !== "web",
      onPanResponderGrant: () => {
        grantDrag("pan_responder");
      },
      onPanResponderMove: (_, g) => {
        moveDragByDx(g.dx, g.vx);
      },
      onPanResponderRelease: (_, g) => {
        endDrag("release", g.dx, g.vx, "pan_responder");
      },
      onPanResponderTerminate: (_, g) => {
        endDrag("terminate", g.dx, g.vx, "pan_responder");
      },
    }),
  ).current;

  const bottomInset = AH.contentInsetBottom;
  const hit = AH.splitPaneDividerHitWidthPx;
  const stroke = AH.splitPaneDividerStrokePx;
  const lineLeft = SPLIT_PANE_LINE_LEFT_IN_HIT;

  const dividerHitStyle: ViewStyle[] = [
    {
      width: hit,
      alignSelf: "stretch",
      position: "relative" as const,
    },
    Platform.OS === "web" && isWide
      ? ({
          cursor: "col-resize",
          touchAction: "none",
          overflow: "visible",
          userSelect: "none",
        } as unknown as ViewStyle)
      : {},
  ];

  /** Web: 1px via `border-left` on zero-width box avoids fractional `width` blur; native keeps filled 1px view. */
  const dividerLineStyle: ViewStyle =
    Platform.OS === "web"
      ? {
          position: "absolute",
          left: lineLeft,
          top: 0,
          bottom: 0,
          width: 0,
          borderLeftWidth: stroke,
          borderLeftColor: colors.highlight,
          borderStyle: "solid",
          backgroundColor: "transparent",
        }
      : {
          position: "absolute",
          left: lineLeft,
          top: 0,
          bottom: 0,
          width: stroke,
          backgroundColor: colors.highlight,
        };

  const inset = AH.contentInsetHorizontal;

  return (
    <View
      style={{ flex: 1, width: "100%", alignSelf: "stretch" }}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        setRowWidth((cur) => {
          if (cur === w) return cur;
          logPageDisplay("home_split_pane_layout", {
            rowWidthPx: w,
            prevRowWidthPx: cur,
            effectiveWide: w > AH.firstBreakpoint,
          });
          return w;
        });
      }}
    >
      {!isWide ? (
        <View style={{ flex: 1, width: "100%", paddingHorizontal: inset }}>{left}</View>
      ) : (
        <View
          style={{
            flex: 1,
            width: "100%",
            flexDirection: "row",
            alignItems: "stretch",
            marginBottom: -bottomInset,
          }}
        >
          <View
            style={{
              width: leftPanePx,
              flexShrink: 0,
              paddingHorizontal: inset,
              paddingBottom: bottomInset,
            }}
          >
            {left}
          </View>
          <View
            style={dividerHitStyle}
            {...(webDividerPointerProps ?? {})}
            {...(Platform.OS === "web" ? {} : panResponder.panHandlers)}
            ref={(node) => {
              if (Platform.OS !== "web") return;
              webDividerHostRef.current = node != null ? (node as unknown as HTMLElement) : null;
            }}
          >
            <View pointerEvents="none" style={dividerLineStyle} />
          </View>
          <View
            style={{
              flex: 1,
              minWidth: AH.splitPaneMinSecondColumnPx,
              paddingHorizontal: inset,
              paddingBottom: bottomInset,
            }}
          >
            {right}
          </View>
        </View>
      )}
    </View>
  );
}
