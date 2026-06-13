import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  SWAP_CHART_LINE_AREA_MIN_HEIGHT_PX,
  SWAP_CHART_TIMESTAMP_GAP_PX,
  SWAP_CHART_TIMESTAMP_ROW_HEIGHT_PX,
  SWAP_EDGE_SWIPE_GUARD_WIDTH_PX,
  SWAP_RESOLUTION_SWIPE_VELOCITY_THRESHOLD,
  stepSwapIntervalKey,
  type SwapChartResolution,
  type SwapIntervalKey,
} from "../../swap/swapChartConstants";
import type { NormalizedChartSeries } from "../../swap/fetchSwapChart";
import { pickChartPointIndex } from "../../swap/swapChartPointer";
import { formatChartTimestamp, formatSwapPrice, maxPriceColumnWidth } from "../../swap/swapChartFormat";
import { chartPointCoordinates } from "../../swap/swapChartPath";
import { selectedDotX, selectedTimestampOffsetX } from "../../swap/swapChartSelectedTimestamp";
import { swapChartLog, swapChartWarn } from "../../swap/swapChartDebug";
import { typographyAeroport10, useColors } from "../../theme";
import { SwapChartCanvas } from "./SwapChartCanvas";
import { SwapChartLineSvg } from "./SwapChartLineSvg";
import { SwapChartSelectionMarker } from "./SwapChartSelectionMarker";

const CHART_PRICE_COLUMN_GAP = 5;
const TEXT_CENTER_OFFSET = 4.5;
const TIMESTAMP_CHAR_WIDTH_PX = 5.6;

type Props = {
  resolution: SwapChartResolution;
  intervalKey: SwapIntervalKey;
  onIntervalKeyChange: (key: SwapIntervalKey) => void;
  series: NormalizedChartSeries | null;
  isLoading: boolean;
  error: string | null;
  selectedPointIndex: number | null;
  onSelectedPointIndexChange: (index: number | null) => void;
  /** When false, chart block keeps at least {@link SWAP_CHART_LINE_AREA_MIN_HEIGHT_PX} for scroll layouts. */
  expandToFill?: boolean;
};

export function SwapChartView({
  resolution,
  intervalKey,
  onIntervalKeyChange,
  series,
  isLoading,
  error,
  selectedPointIndex,
  onSelectedPointIndexChange,
  expandToFill = true,
}: Props) {
  const colors = useColors();
  const [outerSize, setOuterSize] = useState({ width: 0, height: 0 });
  const swipeStartXRef = useRef<number | null>(null);
  const pointerActiveRef = useRef(false);

  const priceColumnWidth = useMemo(
    () =>
      maxPriceColumnWidth(
        series?.points ?? null,
        series?.minPrice ?? null,
        series?.maxPrice ?? null,
      ),
    [series],
  );

  const chartSpaceHeight = useMemo(() => {
    const overhead = SWAP_CHART_TIMESTAMP_GAP_PX + SWAP_CHART_TIMESTAMP_ROW_HEIGHT_PX;
    if (!expandToFill) return SWAP_CHART_LINE_AREA_MIN_HEIGHT_PX;
    if (outerSize.height <= 0) return SWAP_CHART_LINE_AREA_MIN_HEIGHT_PX;
    return Math.max(SWAP_CHART_LINE_AREA_MIN_HEIGHT_PX, outerSize.height - overhead);
  }, [expandToFill, outerSize.height]);

  const derivedChartWidth = useMemo(() => {
    if (outerSize.width <= 0) return 0;
    return Math.max(0, outerSize.width - CHART_PRICE_COLUMN_GAP - priceColumnWidth);
  }, [outerSize.width, priceColumnWidth]);

  /** Chart drawable size from outer layout (prev-main: Expanded chart + fixed timestamp row). */
  const renderSize = useMemo(
    () => ({
      width: derivedChartWidth,
      height: chartSpaceHeight,
    }),
    [derivedChartWidth, chartSpaceHeight],
  );

  const pointerStateRef = useRef({
    series,
    chartSize: renderSize,
    onSelectedPointIndexChange,
  });
  pointerStateRef.current = { series, chartSize: renderSize, onSelectedPointIndexChange };

  const onOuterLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    swapChartLog("view_outer_layout", { width, height, platform: Platform.OS });
    setOuterSize((prev) => {
      // Ignore transient 0×0 during column remount (wide ↔ triple); keeps chart visible.
      if (width <= 0 || height <= 0) return prev;
      if (prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

  useEffect(() => {
    const phase = isLoading
      ? "loading"
      : error
        ? "error"
        : !series?.normalized.length
          ? "empty-series"
          : renderSize.width <= 0 || renderSize.height <= 0
            ? "awaiting-layout"
            : "rendering-chart";

    swapChartLog("view_phase", {
      phase,
      isLoading,
      error,
      pointCount: series?.normalized.length ?? 0,
      outerSize,
      derivedChartWidth,
      chartSpaceHeight,
      renderSize,
      priceColumnWidth,
      selectedPointIndex,
      resolution,
      intervalKey,
    });

    if (phase === "awaiting-layout" && (series?.normalized.length ?? 0) > 0) {
      swapChartWarn("view_data_ready_no_layout", {
        outerSize,
        derivedChartWidth,
        chartSpaceHeight,
        renderSize,
      });
    }
  }, [
    isLoading,
    error,
    series?.normalized.length,
    outerSize,
    derivedChartWidth,
    chartSpaceHeight,
    renderSize,
    priceColumnWidth,
    selectedPointIndex,
    resolution,
    intervalKey,
  ]);

  const handlePointer = useCallback((x: number, y: number) => {
    const { series: s, chartSize: size, onSelectedPointIndexChange: onSelect } =
      pointerStateRef.current;
    if (!s?.normalized.length || size.width <= 0 || size.height <= 0) return;
    const idx = pickChartPointIndex(x, y, size.width, size.height, s.normalized);
    if (idx != null) onSelect(idx);
  }, []);

  const resolvePointerCoords = useCallback((e: GestureResponderEvent) => {
    const ne = e.nativeEvent as {
      locationX?: number;
      locationY?: number;
      offsetX?: number;
      offsetY?: number;
      clientX?: number;
      clientY?: number;
    };
    if (typeof ne.offsetX === "number" && typeof ne.offsetY === "number") {
      return { x: ne.offsetX, y: ne.offsetY };
    }
    const target = e.currentTarget as unknown as HTMLElement | null;
    if (
      target?.getBoundingClientRect &&
      typeof ne.clientX === "number" &&
      typeof ne.clientY === "number"
    ) {
      const rect = target.getBoundingClientRect();
      return { x: ne.clientX - rect.left, y: ne.clientY - rect.top };
    }
    return { x: ne.locationX ?? 0, y: ne.locationY ?? 0 };
  }, []);

  const handleWebPointerDown = useCallback(
    (e: GestureResponderEvent) => {
      pointerActiveRef.current = true;
      const el = e.currentTarget as unknown as HTMLElement | null;
      const ne = e.nativeEvent as { pointerId?: number };
      if (el?.setPointerCapture && typeof ne.pointerId === "number") {
        try {
          el.setPointerCapture(ne.pointerId);
        } catch {
          /* ignore */
        }
      }
      const { x, y } = resolvePointerCoords(e);
      handlePointer(x, y);
    },
    [handlePointer, resolvePointerCoords],
  );

  const handleWebPointerMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!pointerActiveRef.current) return;
      const { x, y } = resolvePointerCoords(e);
      handlePointer(x, y);
    },
    [handlePointer, resolvePointerCoords],
  );

  const endWebPointer = useCallback(() => {
    pointerActiveRef.current = false;
    onSelectedPointIndexChange(null);
  }, [onSelectedPointIndexChange]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Boolean(pointerStateRef.current.series?.normalized.length),
      onMoveShouldSetPanResponder: () => Boolean(pointerStateRef.current.series?.normalized.length),
      onPanResponderGrant: (e) => {
        handlePointer(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e) => {
        handlePointer(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderRelease: () => onSelectedPointIndexChange(null),
      onPanResponderTerminate: () => onSelectedPointIndexChange(null),
    }),
  ).current;

  const resolutionSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-12, 12])
        .onBegin((e) => {
          swipeStartXRef.current = e.x;
        })
        .onEnd((e) => {
          const startX = swipeStartXRef.current;
          swipeStartXRef.current = null;
          if (startX == null || outerSize.width <= 0) return;

          const leftBound = SWAP_EDGE_SWIPE_GUARD_WIDTH_PX;
          const rightBound = outerSize.width - SWAP_EDGE_SWIPE_GUARD_WIDTH_PX;
          if (startX <= leftBound || startX >= rightBound) return;

          const velocity = e.velocityX;
          if (velocity > SWAP_RESOLUTION_SWIPE_VELOCITY_THRESHOLD) {
            const next = stepSwapIntervalKey(intervalKey, "coarser");
            if (next !== intervalKey) onIntervalKeyChange(next);
          } else if (velocity < -SWAP_RESOLUTION_SWIPE_VELOCITY_THRESHOLD) {
            const next = stepSwapIntervalKey(intervalKey, "finer");
            if (next !== intervalKey) onIntervalKeyChange(next);
          }
        }),
    [outerSize.width, intervalKey, onIntervalKeyChange],
  );

  const label10 = useMemo(
    () => [
      typographyAeroport10,
      { color: colors.secondary, fontSize: 10, lineHeight: 10 },
    ],
    [colors.secondary],
  );

  const priceLabelStyle = useMemo(
    () => [...label10, { textAlign: "right" as const }],
    [label10],
  );

  const selectionCoords = useMemo(() => {
    if (
      selectedPointIndex == null ||
      !series?.normalized.length ||
      renderSize.width <= 0 ||
      renderSize.height <= 0
    ) {
      return null;
    }
    return chartPointCoordinates(
      selectedPointIndex,
      series.normalized,
      renderSize.width,
      renderSize.height,
    );
  }, [selectedPointIndex, series?.normalized, renderSize.width, renderSize.height]);

  const renderSelectedTimestampRow = () => {
    if (
      selectedPointIndex == null ||
      !series ||
      selectedPointIndex >= series.points.length ||
      renderSize.width <= 0
    ) {
      return null;
    }

    const point = series.points[selectedPointIndex]!;
    const label = formatChartTimestamp(
      point.timestamp,
      resolution,
      series.firstTimestamp,
      series.lastTimestamp,
    );
    const textWidth = label.length * TIMESTAMP_CHAR_WIDTH_PX;
    const dotX = selectedDotX(selectedPointIndex, series.normalized.length, renderSize.width);
    const offsetX = selectedTimestampOffsetX(dotX, renderSize.width, textWidth);

    const textEl = (
      <Text style={[...label10, { textAlign: "center" }]} numberOfLines={1}>
        {label}
      </Text>
    );

    if (offsetX == null) {
      const align =
        dotX - textWidth / 2 < 0 ? "flex-start" : dotX + textWidth / 2 > renderSize.width ? "flex-end" : "center";
      return (
        <View style={[styles.timestampRowSelected, { alignItems: align as "flex-start" | "center" | "flex-end" }]}>
          {textEl}
        </View>
      );
    }

    return (
      <View style={styles.timestampRowSelected}>
        <View style={{ transform: [{ translateX: offsetX }] }}>{textEl}</View>
      </View>
    );
  };

  const renderDefaultTimestampRow = () => (
    <View style={styles.timestampRowInner}>
      <Text style={label10} numberOfLines={1}>
        {formatChartTimestamp(
          series?.firstTimestamp ?? null,
          resolution,
          series?.firstTimestamp ?? null,
          series?.lastTimestamp ?? null,
        )}
      </Text>
      <Text style={label10} numberOfLines={1}>
        {formatChartTimestamp(
          series?.lastTimestamp ?? null,
          resolution,
          series?.firstTimestamp ?? null,
          series?.lastTimestamp ?? null,
        )}
      </Text>
    </View>
  );

  const renderPriceColumn = () => {
    if (!series || chartSpaceHeight <= 0) return null;

    if (
      selectedPointIndex != null &&
      selectedPointIndex >= 0 &&
      selectedPointIndex < series.points.length
    ) {
      const price = series.points[selectedPointIndex]!.price;
      const normalized = series.normalized[selectedPointIndex]!;
      const dotY = chartSpaceHeight - normalized * chartSpaceHeight;
      const textTop = Math.min(Math.max(0, dotY - TEXT_CENTER_OFFSET), chartSpaceHeight - 10);
      return (
        <Text style={[priceLabelStyle, { position: "absolute", top: textTop, right: 0 }]}>
          {formatSwapPrice(price)}
        </Text>
      );
    }

    const minTop = Math.max(0, chartSpaceHeight - 10);
    return (
      <>
        <Text style={[priceLabelStyle, { position: "absolute", top: 0, right: 0 }]}>
          {formatSwapPrice(series.maxPrice)}
        </Text>
        <Text style={[priceLabelStyle, { position: "absolute", top: minTop, right: 0 }]}>
          {formatSwapPrice(series.minPrice)}
        </Text>
      </>
    );
  };

  const webPointerHandlers =
    Platform.OS === "web"
      ? ({
          onPointerDown: handleWebPointerDown,
          onPointerMove: handleWebPointerMove,
          onPointerUp: endWebPointer,
          onPointerCancel: endWebPointer,
          onPointerLeave: endWebPointer,
          onMouseDown: handleWebPointerDown,
          onMouseMove: (e: GestureResponderEvent) => {
            if (pointerActiveRef.current) {
              const { x, y } = resolvePointerCoords(e);
              handlePointer(x, y);
            }
          },
          onMouseUp: endWebPointer,
          onMouseLeave: endWebPointer,
        } as Record<string, unknown>)
      : panResponder.panHandlers;

  const renderChartBody = () => {
    if (isLoading) {
      return (
        <View style={styles.chartCentered}>
          <ActivityIndicator size="small" color={colors.secondary} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={[styles.chartCentered, { padding: 8 }]}>
          <Text style={[...label10, { textAlign: "center" }]}>{error}</Text>
        </View>
      );
    }

    if (!series?.normalized.length) {
      return null;
    }

    const ready = renderSize.width > 0 && renderSize.height > 0;
    if (!ready) return null;

    const chartSlot = (
      <View
        style={[
          styles.chartSlot,
          {
            width: renderSize.width,
            height: renderSize.height,
          },
          Platform.OS === "web"
            ? ({ touchAction: "none", cursor: "crosshair" } as unknown as ViewStyle)
            : null,
        ]}
      >
        <View pointerEvents="none" style={{ width: renderSize.width, height: renderSize.height }}>
          {Platform.OS === "web" ? (
            <SwapChartCanvas
              width={renderSize.width}
              height={renderSize.height}
              normalizedPoints={series.normalized}
              lineColor={colors.primary}
            />
          ) : (
            <SwapChartLineSvg
              width={renderSize.width}
              height={renderSize.height}
              normalizedPoints={series.normalized}
              lineColor={colors.primary}
            />
          )}
        </View>
        {selectionCoords ? (
          <SwapChartSelectionMarker
            x={selectionCoords.x}
            y={selectionCoords.y}
            fillColor={colors.background}
            strokeColor={colors.primary}
          />
        ) : null}
        <View
          style={[StyleSheet.absoluteFill, styles.pointerLayer]}
          {...webPointerHandlers}
        />
      </View>
    );

    if (Platform.OS === "web") {
      return chartSlot;
    }

    return <GestureDetector gesture={resolutionSwipeGesture}>{chartSlot}</GestureDetector>;
  };

  return (
    <View
      style={[styles.root, expandToFill ? styles.rootFill : styles.rootIntrinsic]}
      onLayout={onOuterLayout}
    >
      <View style={styles.row}>
        <View style={styles.leftColumn}>
          <View
            style={[
              styles.chartArea,
              chartSpaceHeight > 0
                ? { height: chartSpaceHeight, flexGrow: 0, flexShrink: 0 }
                : null,
            ]}
          >
            {renderChartBody()}
          </View>
          <View style={{ height: SWAP_CHART_TIMESTAMP_GAP_PX }} />
          <View style={styles.timestampRow}>
            {selectedPointIndex != null ? renderSelectedTimestampRow() : renderDefaultTimestampRow()}
          </View>
        </View>
        <View style={{ width: CHART_PRICE_COLUMN_GAP }} />
        <View
          style={[
            styles.priceColumn,
            chartSpaceHeight > 0 ? { height: chartSpaceHeight } : null,
            { width: priceColumnWidth },
          ]}
        >
          {renderPriceColumn()}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  rootFill: {
    flex: 1,
    minHeight: 0,
  },
  rootIntrinsic: {
    minHeight:
      SWAP_CHART_LINE_AREA_MIN_HEIGHT_PX +
      SWAP_CHART_TIMESTAMP_GAP_PX +
      SWAP_CHART_TIMESTAMP_ROW_HEIGHT_PX,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 0,
    overflow: "hidden",
  },
  leftColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  },
  chartArea: {
    flex: 1,
    minHeight: SWAP_CHART_LINE_AREA_MIN_HEIGHT_PX,
    width: "100%",
    alignSelf: "stretch",
  },
  chartSlot: {
    position: "relative",
    alignSelf: "flex-start",
  },
  pointerLayer: {
    zIndex: 2,
  },
  chartCentered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
  },
  timestampRow: {
    height: SWAP_CHART_TIMESTAMP_ROW_HEIGHT_PX,
    justifyContent: "center",
    overflow: "hidden",
  },
  timestampRowInner: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  timestampRowSelected: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  priceColumn: {
    position: "relative",
    overflow: "hidden",
  },
});
