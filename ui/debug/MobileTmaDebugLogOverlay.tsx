import { useEffect, useRef, useState, useSyncExternalStore, useWindowDimensions } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useTelegram } from "../components/Telegram";
import { layout, useColors } from "../theme";
import {
  getAppLogRingBufferSnapshot,
  subscribeAppLogRingBuffer,
  type AppLogRingEntry,
} from "./appLogRingBuffer";

const PANEL_WIDTH_RATIO = 0.8;
const PANEL_HEIGHT_RATIO = 0.5;
const PANEL_Z_INDEX = 1_000_000;

function useDebugLogOverlayEnabled(): boolean {
  const { isInTelegram } = useTelegram();
  if (Platform.OS !== "web") return false;
  if (isInTelegram) return true;
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("hsp_debug_log") === "1";
  } catch {
    return false;
  }
}

function formatRowClock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function LogRow({ row }: { row: AppLogRingEntry }) {
  const colors = useColors();
  const tone =
    row.level === "error"
      ? "#f57474"
      : row.level === "warn"
        ? colors.secondary
        : colors.primary;
  return (
    <Text
      style={{
        color: tone,
        fontSize: 10,
        lineHeight: 13,
        fontFamily: Platform.OS === "web" ? "ui-monospace, monospace" : undefined,
        marginBottom: 2,
      }}
    >
      <Text style={{ color: colors.secondary }}>{formatRowClock(row.at)} </Text>
      {row.text}
    </Text>
  );
}

/** Temporary TMA debug strip — remove when mobile chat navigation is fixed. */
export function MobileTmaDebugLogOverlay() {
  const enabled = useDebugLogOverlayEnabled();
  const colors = useColors();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [pinBottom, setPinBottom] = useState(true);
  const scrollRef = useRef<ScrollView | null>(null);
  const logs = useSyncExternalStore(subscribeAppLogRingBuffer, getAppLogRingBufferSnapshot, () => []);

  const panelWidth = Math.max(0, windowWidth * PANEL_WIDTH_RATIO);
  const panelHeight = Math.max(0, windowHeight * PANEL_HEIGHT_RATIO);
  const panelLeft = Math.max(0, (windowWidth - panelWidth) / 2);

  useEffect(() => {
    if (!pinBottom) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [logs.length, pinBottom]);

  if (!enabled) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: panelLeft,
        width: panelWidth,
        height: panelHeight,
        zIndex: PANEL_Z_INDEX,
      }}
    >
      <View
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: `${colors.background}ee`,
          borderWidth: 1,
          borderColor: colors.highlight,
          borderTopWidth: 0,
          paddingTop: 6,
          paddingHorizontal: layout.contentSideInsetPx,
          paddingBottom: 4,
        }}
      >
        <Text
          style={{
            color: colors.primary,
            fontSize: 11,
            fontWeight: "600",
            marginBottom: 4,
          }}
          numberOfLines={1}
        >
          Debug log ({logs.length}) — screenshot this panel
        </Text>
        <ScrollView
          ref={scrollRef}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distBottom =
              contentSize.height - layoutMeasurement.height - contentOffset.y;
            setPinBottom(distBottom < 32);
          }}
          scrollEventThrottle={32}
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          {logs.map((row) => (
            <LogRow key={row.id} row={row} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
