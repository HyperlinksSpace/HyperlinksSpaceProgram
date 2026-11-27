import { createElement, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Platform, Text, useWindowDimensions, View } from "react-native";
import { useTelegram } from "../components/Telegram";
import { useColors } from "../theme";
import {
  getAppLogRingBufferSnapshot,
  subscribeAppLogRingBuffer,
  type AppLogRingEntry,
} from "./appLogRingBuffer";

const PANEL_WIDTH_RATIO = 0.92;
const PANEL_HEIGHT_RATIO = 0.32;
const PANEL_Z_INDEX = 1_000_000;
const PANEL_EXTRA_TOP_PX = 50;
const SCROLL_MAX_ROWS = 28;
const TAIL_MAX_ROWS = 10;

/** High-signal history / open / transport — shown pinned at the bottom of the panel. */
const CRITICAL_TAIL_RE =
  /messages_history_(gesture_prime|gesture_prime_defer_path|gesture_prime_start|gesture_prime_supersede_pre_path|join_await|tma_body_host|fetch_|network_begin|text_hit|load_start|load_ok|load_error|web_fetch_error|prefetch_skip|ios_|compact_cache|open_xhr_retry|fetch_ios_chat_blocked|ios_bubble_paint|ios_join_paint|compact_cache_open_sync|compact_cache_listener_rescue|fetch_url|fetch_tma_home_lane|fetch_tma_home_fallback|fetch_tma_alt|fetch_tma_race|fetch_tma_seq|fetch_tma_both|fetch_tma_path_race|fetch_tma_path_xhr_script|fetch_tma_path_fetch_lane|fetch_tma_path_fetch|fetch_tma_path_fetch_fallback|open_read_join|open_read_supersede|ios_body_join|ios_xhr_send|ios_xhr_stall|empty_open_retry|fetch_tma_fallback|network_begin_join_only|tma_compact_route_ready|ios_path_ready|ios_route_dual_arm|ios_body_abandon|ios_route_wait|ios_xhr_arm|ios_xhr_hit|load_watchdog_kick|ios_script_ios_body_timeout_retry|json_ready|tma_sync_paint|open_shared_reset|open_rejoin_after_supersede|web_open_paint)|messages_chat_open|messages_compact_chat_route/;

const SCROLL_LINE_KEEP_RE =
  /messages_chat_row_press|messages_chat_row_web_click|messages_chat_open|messages_compact_chat|messages_history_|messages_compact_chat_route|telegram_messages_status|auth_session_refresh|messages_chat_row_press_in/;

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
  const text = row.text.replace(/\s+root_shell\s+/g, " root_shell ");
  return `${formatRowClock(row.at)} ${text}`;
}

function pickCriticalTail(entries: readonly AppLogRingEntry[]): AppLogRingEntry[] {
  const matches: AppLogRingEntry[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const row = entries[i]!;
    if (!CRITICAL_TAIL_RE.test(row.text)) continue;
    matches.push(row);
    if (matches.length >= TAIL_MAX_ROWS) break;
  }
  matches.reverse();
  return matches;
}

function pickScrollRows(entries: readonly AppLogRingEntry[]): AppLogRingEntry[] {
  let kept = entries.filter((row) => SCROLL_LINE_KEEP_RE.test(row.text));
  if (kept.length === 0) {
    kept = entries.filter((row) => DEBUG_LINE_FALLBACK_RE.test(row.text));
  }
  if (kept.length === 0) {
    kept = entries.slice(-20);
  }
  const shells = kept.filter((row) => /root_shell/.test(row.text));
  const nonShell = kept.filter((row) => !/root_shell/.test(row.text));
  const lastShell = shells.length > 0 ? shells[shells.length - 1]! : null;
  const merged = lastShell != null ? [...nonShell, lastShell] : nonShell;
  return merged.length > SCROLL_MAX_ROWS
    ? merged.slice(merged.length - SCROLL_MAX_ROWS)
    : merged;
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
    ) + PANEL_EXTRA_TOP_PX;
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const [pinBottom, setPinBottom] = useState(true);
  const logStore = useSyncExternalStore(
    subscribeAppLogRingBuffer,
    getAppLogRingBufferSnapshot,
    () => ({ revision: 0, entries: [] as const }),
  );

  const criticalTail = useMemo(
    () => pickCriticalTail(logStore.entries),
    [logStore.entries],
  );

  const scrollLogs = useMemo(() => pickScrollRows(logStore.entries), [logStore.entries]);

  const panelWidth = Math.max(0, windowWidth * PANEL_WIDTH_RATIO);
  const panelHeight = Math.max(140, windowHeight * PANEL_HEIGHT_RATIO);
  const panelLeft = Math.max(0, (windowWidth - panelWidth) / 2);
  const panelTop = topInsetPx;

  useEffect(() => {
    if (!pinBottom || Platform.OS !== "web") return;
    const el = logScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logStore.revision, pinBottom, scrollLogs.length]);

  if (!enabled) return null;

  const monoStyle = {
    color: colors.primary,
    fontSize: 9,
    lineHeight: "12px",
    fontFamily: "ui-monospace, monospace",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  };

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
              minHeight: 48,
              overflow: "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
              pointerEvents: "auto",
              ...monoStyle,
              opacity: 0.85,
            },
          },
          scrollLogs.map((row) => createElement("div", { key: `s-${row.id}` }, formatLogLine(row))),
        )
      : null;

  const tailBody =
    Platform.OS === "web"
      ? createElement(
          "div",
          {
            style: {
              flexShrink: 0,
              maxHeight: 132,
              overflow: "hidden",
              borderTopWidth: 1,
              borderTopStyle: "solid",
              borderTopColor: colors.accent,
              paddingTop: 4,
              marginTop: 4,
              ...monoStyle,
              fontWeight: 600,
              color: colors.accent,
            },
          },
          criticalTail.length === 0
            ? createElement(
                "div",
                { key: "tail-empty" },
                "— tail: waiting for history / fetch / load events —",
              )
            : criticalTail.map((row) =>
                createElement("div", { key: `t-${row.id}` }, formatLogLine(row)),
              ),
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
          display: "flex",
          flexDirection: "column",
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
          Chat debug scroll {scrollLogs.length} · tail {criticalTail.length} · #
          {logStore.revision}
        </Text>
        <View style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {logBody}
          {tailBody}
        </View>
      </View>
    </View>
  );
}