import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  SWAP_EDGE_SWIPE_GUARD_WIDTH_PX,
  SWAP_RESOLUTION_SWIPE_VELOCITY_THRESHOLD,
  stepSwapIntervalKey,
  type SwapChartResolution,
  type SwapIntervalKey,
} from "../../swap/swapChartConstants";
import type { NormalizedChartSeries } from "../../swap/fetchSwapChart";
import { pickChartPointIndex } from "../../swap/swapChartPointer";
import { formatChartTimestamp, formatSwapPrice, maxPriceColumnWidth } from "../../swap/swapChartFormat";
import { typographySansSemibold, useColors } from "../../theme";
import { SwapChartLineSvg } from "./SwapChartLineSvg";

const CHART_TIMESTAMP_ROW_HEIGHT = 15;
const CHART_PRICE_COLUMN_GAP = 5;
const TEXT_CENTER_OFFSET = 4.5;

type Props = {
  resolution: SwapChartResolution;
  intervalKey: SwapIntervalKey;
  onIntervalKeyChange: (key: SwapIntervalKey) => void;
  series: NormalizedChartSeries | null;
  isLoading: boolean;
  error: string | null;
  selectedPointIndex: number | null;
  onSelectedPointIndexChange: (index: number | null) => void;
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
}: Props) {
  const colors = useColors();
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  const swipeStartXRef = useRef<number | null>(null);

  const pointerStateRef = useRef({
    series,
    chartSize,
    onSelectedPointIndexChange,
  });
  pointerStateRef.current = { series, chartSize, onSelectedPointIndexChange };

  const priceColumnWidth = useMemo(
    () =>
      maxPriceColumnWidth(
        series?.points ?? null,
        series?.minPrice ?? null,
        series?.maxPrice ?? null,
      ),
    [series],
  );

  const onChartLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setChartSize({ width, height });
    }
  }, []);

  const onOuterLayout = useCallback((e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0) setContainerWidth(width);
  }, []);

  const handlePointer = useCallback((x: number, y: number) => {
    const { series: s, chartSize: size, onSelectedPointIndexChange: onSelect } =
      pointerStateRef.current;
    if (!s?.normalized.length || size.width <= 0 || size.height <= 0) return;
    const idx = pickChartPointIndex(x, y, size.width, size.height, s.normalized);
    if (idx != null) onSelect(idx);
  }, []);

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
      onPanResponderRelease: () => pointerStateRef.current.onSelectedPointIndexChange(null),
      onPanResponderTerminate: () => pointerStateRef.current.onSelectedPointIndexChange(null),
    }),
  ).current;

  const webPointerProps =
    Platform.OS === "web"
      ? {
          onMouseMove: (e: GestureResponderEvent) => {
            handlePointer(e.nativeEvent.locationX, e.nativeEvent.locationY);
          },
          onMouseLeave: () => onSelectedPointIndexChange(null),
        }
      : {};

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
          if (startX == null || containerWidth <= 0) return;

          const leftBound = SWAP_EDGE_SWIPE_GUARD_WIDTH_PX;
          const rightBound = containerWidth - SWAP_EDGE_SWIPE_GUARD_WIDTH_PX;
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
    [containerWidth, intervalKey, onIntervalKeyChange],
  );

  const label10 = useMemo(
    () => [
      typographySansSemibold,
      {
        fontSize: 10,
        lineHeight: 10,
        color: colors.secondary,
        fontWeight: "400" as const,
      },
    ],
    [colors.secondary],
  );

  const priceLabelStyle = useMemo(
    () => [...label10, { textAlign: "right" as const }],
    [label10],
  );

  const renderTimestampRow = () => {
    if (
      selectedPointIndex != null &&
      series &&
      selectedPointIndex < series.points.length
    ) {
      const point = series.points[selectedPointIndex]!;
      return (
        <Text style={[...label10, { textAlign: "center" }]} numberOfLines={1}>
          {formatChartTimestamp(
            point.timestamp,
            resolution,
            series.firstTimestamp,
            series.lastTimestamp,
          )}
        </Text>
      );
    }

    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
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
  };

  const renderPriceColumn = (height: number) => {
    if (!series || height <= 0) {
      return null;
    }

    if (
      selectedPointIndex != null &&
      selectedPointIndex >= 0 &&
      selectedPointIndex < series.points.length
    ) {
      const price = series.points[selectedPointIndex]!.price;
      const normalized = series.normalized[selectedPointIndex]!;
      const dotY = height - normalized * height;
      const textTop = Math.min(Math.max(0, dotY - TEXT_CENTER_OFFSET), height - 10);
      return (
        <Text style={[priceLabelStyle, { position: "absolute", top: textTop, right: 0 }]}>
          {formatSwapPrice(price)}
        </Text>
      );
    }

    const minTop = Math.max(0, height - 10);
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

  const renderChartCanvas = () => {
    if (isLoading) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={colors.secondary} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 8 }}>
          <Text style={[...label10, { textAlign: "center" }]}>{error}</Text>
        </View>
      );
    }

    if (!series?.normalized.length) {
      return <View style={{ flex: 1 }} />;
    }

    const chartBody = (
      <View
        style={{ flex: 1 }}
        onLayout={onChartLayout}
        {...(Platform.OS === "web" ? webPointerProps : panResponder.panHandlers)}
      >
        {chartSize.width > 0 && chartSize.height > 0 ? (
          <SwapChartLineSvg
            width={chartSize.width}
            height={chartSize.height}
            normalizedPoints={series.normalized}
            selectedPointIndex={selectedPointIndex}
            lineColor={colors.primary}
            dotFillColor={colors.background}
            dotStrokeColor={colors.primary}
          />
        ) : null}
      </View>
    );

    if (Platform.OS === "web") {
      return chartBody;
    }

    return <GestureDetector gesture={resolutionSwipeGesture}>{chartBody}</GestureDetector>;
  };

  const chartSpaceHeight = chartSize.height;

  return (
    <View style={{ flex: 1, width: "100%", minHeight: 120 }} onLayout={onOuterLayout}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flex: 1, minHeight: 0 }}>{renderChartCanvas()}</View>
          <View style={{ height: CHART_PRICE_COLUMN_GAP }} />
          <View
            style={{
              height: CHART_TIMESTAMP_ROW_HEIGHT,
              justifyContent: "center",
            }}
          >
            {renderTimestampRow()}
          </View>
        </View>
        <View style={{ width: CHART_PRICE_COLUMN_GAP }} />
        <View
          style={{
            width: priceColumnWidth,
            height: chartSpaceHeight > 0 ? chartSpaceHeight : undefined,
            alignSelf: "flex-start",
            position: "relative",
          }}
        >
          {chartSpaceHeight > 0 ? renderPriceColumn(chartSpaceHeight) : null}
        </View>
      </View>
    </View>
  );
}
