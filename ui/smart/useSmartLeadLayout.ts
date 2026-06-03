import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, useWindowDimensions, type LayoutChangeEvent } from "react-native";

import { logPageDisplay } from "../pageDisplayLog";
import { resolveWebLayoutElement, resolveWebRefElement } from "./resolveWebLayoutElement";
import {
  SMART_LEAD_HEIGHT_COMPACT_PX,
  SMART_LEAD_HEIGHT_PX,
  SMART_LEAD_WIDTH_BREAKPOINT_PX,
  smartLeadHeightPxForWidth,
} from "./smartAssets";

type Options = {
  /** Preferred width from a parent shell/column probe (updates when split panes or viewport resize). */
  layoutWidthPx?: number;
};

type WidthSource = "parentLayoutWidthPx" | "probeOnLayout" | "probeResizeObserver" | "windowDimensions";

export function useSmartLeadLayout({ layoutWidthPx = 0 }: Options = {}) {
  const { width: windowWidth } = useWindowDimensions();
  const [probedWidthPx, setProbedWidthPx] = useState(0);
  const [probeNode, setProbeNode] = useState<HTMLElement | null>(null);
  const lastLoggedKeyRef = useRef<string | null>(null);

  const reportProbeWidth = useCallback((width: number, source: "probeOnLayout" | "probeResizeObserver" | "windowDimensions") => {
    const rounded = Math.round(width);
    setProbedWidthPx((current) => (current === rounded ? current : rounded));
    if (layoutWidthPx <= 0) {
      logPageDisplay("smart_lead_probe_width", {
        source,
        widthPx: rounded,
        windowWidth: Math.round(windowWidth),
      });
    }
  }, [layoutWidthPx, windowWidth]);

  const onProbeLayout = useCallback(
    (event: LayoutChangeEvent) => {
      reportProbeWidth(event.nativeEvent.layout.width, "probeOnLayout");
      const layoutElement = resolveWebLayoutElement(event);
      if (layoutElement) {
        setProbeNode((current) => (current === layoutElement ? current : layoutElement));
      }
    },
    [reportProbeWidth],
  );

  const onProbeRef = useCallback((node: unknown) => {
    const element = resolveWebRefElement(node);
    if (element) {
      setProbeNode((current) => (current === element ? current : element));
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !probeNode || typeof ResizeObserver === "undefined") {
      return;
    }

    const measure = () => reportProbeWidth(probeNode.getBoundingClientRect().width, "probeResizeObserver");

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(probeNode);
    return () => observer.disconnect();
  }, [probeNode, reportProbeWidth]);

  useEffect(() => {
    if (Platform.OS !== "web" || !probeNode) {
      return;
    }
    reportProbeWidth(probeNode.getBoundingClientRect().width, "windowDimensions");
  }, [windowWidth, probeNode, reportProbeWidth]);

  const widthSource: WidthSource =
    layoutWidthPx > 0
      ? "parentLayoutWidthPx"
      : probedWidthPx > 0
        ? "probeOnLayout"
        : "windowDimensions";

  const resolvedLayoutWidth =
    layoutWidthPx > 0 ? layoutWidthPx : probedWidthPx > 0 ? probedWidthPx : windowWidth;
  const height = smartLeadHeightPxForWidth(resolvedLayoutWidth);
  const compact = height === SMART_LEAD_HEIGHT_COMPACT_PX;

  useEffect(() => {
    const key = [
      layoutWidthPx,
      probedWidthPx,
      Math.round(windowWidth),
      resolvedLayoutWidth,
      height,
      compact,
      widthSource,
    ].join("|");
    if (lastLoggedKeyRef.current === key) {
      return;
    }
    lastLoggedKeyRef.current = key;
    logPageDisplay("smart_lead_layout", {
      layoutWidthPx: layoutWidthPx > 0 ? layoutWidthPx : null,
      probedWidthPx: probedWidthPx > 0 ? probedWidthPx : null,
      windowWidth: Math.round(windowWidth),
      resolvedLayoutWidth: Math.round(resolvedLayoutWidth),
      heightPx: height,
      compact,
      widthSource,
      breakpointPx: SMART_LEAD_WIDTH_BREAKPOINT_PX,
      heightWidePx: SMART_LEAD_HEIGHT_PX,
      heightCompactPx: SMART_LEAD_HEIGHT_COMPACT_PX,
    });
  }, [
    compact,
    height,
    layoutWidthPx,
    probedWidthPx,
    resolvedLayoutWidth,
    widthSource,
    windowWidth,
  ]);

  return {
    height,
    onProbeLayout,
    onProbeRef: Platform.OS === "web" ? onProbeRef : undefined,
  };
}
