import { createElement, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Platform, Text, useWindowDimensions, View } from "react-native";
import { useTelegram } from "../components/Telegram";
import { layout, useColors } from "../theme";
import {
  getAppLogRingBufferSnapshot,
  subscribeAppLogRingBuffer,
  type AppLogRingEntry,
} from "./appLogRingBuffer";

const PANEL_WIDTH_RATIO = 0.92;
const PANEL_HEIGHT_RATIO = 0.28;
const PANEL_Z_INDEX = 1_000_000;
const PANEL_EXTRA_TOP_PX = 50;
const MAX_FILTERED_ROWS = 48;

const DEBUG_LINE_KEEP_RE =
  /messages_chat_row_press|messages_chat_row_web_click|messages_chat_open|messages_compact_chat|root_shell pathname=|messages_history_|messages_compact_chat_route|telegram_messages_status|auth_session_refresh|messages_history_open_supersede|messages_history_open_shared_reset|messages_history_load_start|messages_history_load_ok|messages_history_priority_prefetch_skip|messages_history_load_stale_latch|messages_history_compact_stall_kick|messages_history_compact_route_prefetch|messages_history_compact_inflight_stale|messages_history_cache_hit|messages_history_compact_route_cache_poke|messages_history_compact_route_prefetch_join|messages_history_open_load_begin|messages_history_compact_cache_replay/;
const DEBUG_LINE_FALLBACK_RE = /\[page-display\] messages_/;

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

function formatLogLine(row: AppLogRingEntry): string {
  return `${formatRowClock(row.at)} ${row.text}`;
}

/** Temporary TMA debug strip — remove when mobile chat navigation is fixed. */
export function MobileTmaDebugLogOverlay() {
  const enabled = useDebugLogOverlayEnabled();
  const colors = useColors();
  const { contentSafeAreaInsetTop, safeAreaInsetTop } = useTelegram();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const topInsetPx =
    Math.max(
      8,
      Math.ceil(contentSafeAreaInsetTop || 0),
      Math.ceil(safeAreaInsetTop || 0),
    ) +
    PANEL_EXTRA_TOP_PX;
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const [pinBottom, setPinBottom] = useState(true);
  const logStore = useSyncExternalStore(
    subscribeAppLogRingBuffer,
    getAppLogRingBufferSnapshot,
    () => ({ revision: 0, entries: [] as const }),
  );

  const filteredLogs = useMemo(() => {
    let kept = logStore.entries.filter((row) => DEBUG_LINE_KEEP_RE.test(row.text));
    if (kept.length === 0) {
      kept = logStore.entries.filter((row) => DEBUG_LINE_FALLBACK_RE.test(row.text));
    }
    if (kept.length === 0) {
      kept = logStore.entries.slice(-24);
    }
    return kept.length > MAX_FILTERED_ROWS
      ? kept.slice(kept.length - MAX_FILTERED_ROWS)
      : kept;
  }, [logStore.entries]);

  const panelWidth = Math.max(0, windowWidth * PANEL_WIDTH_RATIO);
  const panelHeight = Math.max(120, windowHeight * PANEL_HEIGHT_RATIO);
  const panelLeft = Math.max(0, (windowWidth - panelWidth) / 2);
  const panelTop = topInsetPx;

  useEffect(() => {
    if (!pinBottom || Platform.OS !== "web") return;
    const el = logScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logStore.revision, pinBottom]);

  if (!enabled) return null;

  const logBody =
    Platform.OS === "web"
      ? createElement(
          "div",
          {
            ref: logScrollRef,
            onScroll: () => {
              const el = logScrollRef.current;
              if (!el) return;
              const distBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
              setPinBottom(distBottom < 24);
            },
            style: {
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
              pointerEvents: "auto",
              color: colors.primary,
              fontSize: 9,
              lineHeight: "12px",
              fontFamily: "ui-monospace, monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            },
          },
          filteredLogs.map((row) => createElement("div", { key: row.id }, formatLogLine(row))),
        )
      : null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: panelTop,
        left: panelLeft,
        width: panelWidth,
        height: panelHeight,
        zIndex: PANEL_Z_INDEX,
      }}
    >
      <View
        pointerEvents="auto"
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: `${colors.background}f5`,
          borderWidth: 1,
          borderColor: colors.accent,
          paddingTop: 4,
          paddingHorizontal: 8,
          paddingBottom: 4,
        }}
      >
        <Text
          style={{
            color: colors.primary,
            fontSize: 10,
            fontWeight: "600",
            marginBottom: 2,
          }}
          numberOfLines={1}
        >
          Chat debug {filteredLogs.length}/{logStore.entries.length} #{logStore.revision}
        </Text>
        {logBody}
      </View>
    </View>
  );
}
