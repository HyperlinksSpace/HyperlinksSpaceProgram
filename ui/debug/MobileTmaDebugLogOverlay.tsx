import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { useTelegram } from "../components/Telegram";
import { FloatingDialogCloseButton } from "../components/FloatingDialogCloseButton";
import { layout, useColors } from "../theme";
import {
  clearAppLogRingBuffer,
  formatAppLogRingForCopy,
  getAppLogRingBufferSnapshot,
  installMobileTmaDebugLogCapture,
  subscribeAppLogRingBuffer,
  type AppLogRingEntry,
} from "./appLogRingBuffer";

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

function LogRow({ row, filter }: { row: AppLogRingEntry; filter: string }) {
  const colors = useColors();
  const query = filter.trim().toLowerCase();
  if (query && !row.text.toLowerCase().includes(query)) return null;
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
        fontSize: 11,
        lineHeight: 14,
        fontFamily: Platform.OS === "web" ? "ui-monospace, monospace" : undefined,
        marginBottom: 4,
      }}
    >
      <Text style={{ color: colors.secondary }}>{formatRowClock(row.at)} </Text>
      {row.text}
    </Text>
  );
}

export function MobileTmaDebugLogOverlay() {
  const enabled = useDebugLogOverlayEnabled();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("messages_compact");
  const [pinBottom, setPinBottom] = useState(true);
  const scrollRef = useRef<ScrollView | null>(null);
  const logs = useSyncExternalStore(subscribeAppLogRingBuffer, getAppLogRingBufferSnapshot, () => []);

  useEffect(() => {
    if (!enabled) return;
    installMobileTmaDebugLogCapture();
  }, [enabled]);

  useEffect(() => {
    if (!open || !pinBottom) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [logs.length, open, pinBottom]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setPinBottom(distBottom < 48);
  }, []);

  const copyLogs = useCallback(() => {
    const text = formatAppLogRingForCopy(logs);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
      return;
    }
    if (typeof document !== "undefined") {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }, [logs]);

  const filteredCount = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return logs.length;
    return logs.filter((row) => row.text.toLowerCase().includes(query)).length;
  }, [filter, logs]);

  if (!enabled) return null;

  const launcher = (
    <Pressable
      onPress={() => setOpen(true)}
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 100_001,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: `${colors.secondary}33`,
        borderWidth: 1,
        borderColor: colors.highlight,
      }}
    >
      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>DBG ({logs.length})</Text>
    </Pressable>
  );

  if (!open) {
    return launcher;
  }

  return (
    <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 100_000,
          backgroundColor: `${colors.background}f2`,
          paddingTop: 8,
          paddingHorizontal: layout.contentSideInsetPx,
          paddingBottom: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
            gap: 8,
          }}
        >
          <Text style={{ flex: 1, color: colors.primary, fontSize: 15, fontWeight: "600" }}>
            Debug log ({filteredCount}/{logs.length})
          </Text>
          <Pressable
            onPress={clearAppLogRingBuffer}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Text style={{ color: colors.secondary, fontSize: 13 }}>Clear</Text>
          </Pressable>
          <Pressable onPress={copyLogs} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: colors.secondary, fontSize: 13 }}>Copy</Text>
          </Pressable>
          <FloatingDialogCloseButton label="Close debug log" onPress={() => setOpen(false)} />
        </View>
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter (substring)"
          placeholderTextColor={colors.secondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            color: colors.primary,
            borderWidth: 1,
            borderColor: colors.highlight,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 8,
            fontSize: 13,
          }}
        />
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={32}
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {logs.map((row) => (
            <LogRow key={row.id} row={row} filter={filter} />
          ))}
        </ScrollView>
      </View>
  );
}
