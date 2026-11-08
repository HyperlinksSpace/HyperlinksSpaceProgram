import { setAppLogRingSink } from "../../shared/appLog";

export type AppLogRingLevel = "log" | "warn" | "error";

export type AppLogRingEntry = {
  id: number;
  at: number;
  level: AppLogRingLevel;
  text: string;
};

export type AppLogRingStoreSnapshot = {
  revision: number;
  entries: readonly AppLogRingEntry[];
};

const MAX_ENTRIES = 500;
const SESSION_PERSIST_MAX = 200;
const DEBUG_LOG_SESSION_KEY = "hsp_tma_debug_log_ring_v1";
let nextId = 1;
const entries: AppLogRingEntry[] = [];
const listeners = new Set<() => void>();
/** Skip the next console tap mirror(s) when appLog already wrote through the sink. */
let skipConsoleRingMirrorCount = 0;

let storeSnapshot: AppLogRingStoreSnapshot = { revision: 0, entries: [] };

function refreshStoreSnapshot(): void {
  storeSnapshot = {
    revision: storeSnapshot.revision + 1,
    entries: entries.slice(),
  };
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function persistDebugLogSession(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(
      DEBUG_LOG_SESSION_KEY,
      JSON.stringify(entries.slice(-SESSION_PERSIST_MAX)),
    );
  } catch {
    /* private mode / quota */
  }
}

function restoreDebugLogSession(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const raw = sessionStorage.getItem(DEBUG_LOG_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const row of parsed) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const entry = row as Record<string, unknown>;
      const id = Number(entry.id);
      const at = Number(entry.at);
      const text = typeof entry.text === "string" ? entry.text : "";
      const level = entry.level;
      if (!Number.isFinite(id) || !text) continue;
      if (level !== "log" && level !== "warn" && level !== "error") continue;
      entries.push({ id, at: Number.isFinite(at) ? at : Date.now(), level, text });
      nextId = Math.max(nextId, Math.trunc(id) + 1);
    }
    refreshStoreSnapshot();
  } catch {
    /* corrupt session */
  }
}

export function appendAppLogRingBuffer(
  level: AppLogRingLevel,
  text: string,
  options?: { skipConsoleMirrorOnce?: boolean },
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  entries.push({
    id: nextId++,
    at: Date.now(),
    level,
    text: trimmed,
  });
  while (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
  refreshStoreSnapshot();
  if (options?.skipConsoleMirrorOnce) {
    skipConsoleRingMirrorCount = 1;
  }
  persistDebugLogSession();
  emit();
}

export function clearAppLogRingBuffer(): void {
  entries.length = 0;
  refreshStoreSnapshot();
  try {
    sessionStorage?.removeItem(DEBUG_LOG_SESSION_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function getAppLogRingBufferSnapshot(): AppLogRingStoreSnapshot {
  return storeSnapshot;
}

export function subscribeAppLogRingBuffer(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

let consoleTapInstalled = false;

const CONSOLE_TAP_PREFIX_RE =
  /^\[(page-display|telegram-|TMA |Telegram\.WebView)\]/;

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((value) => {
      if (typeof value === "string") return value;
      if (value instanceof Error) return value.message;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ");
}

/** Mirror tagged console lines into the ring buffer (TMA has no DevTools). */
export function installMobileTmaDebugLogCapture(): void {
  if (typeof window === "undefined" || consoleTapInstalled) return;
  consoleTapInstalled = true;
  restoreDebugLogSession();
  emit();
  setAppLogRingSink((level, line) =>
    appendAppLogRingBuffer(level, line, { skipConsoleMirrorOnce: true }),
  );

  const bind =
    <K extends "log" | "warn" | "error">(level: K, original: (typeof console)[K]) =>
    (...args: unknown[]) => {
      original.apply(console, args as never);
      if (skipConsoleRingMirrorCount > 0) {
        skipConsoleRingMirrorCount -= 1;
        return;
      }
      const line = formatConsoleArgs(args);
      if (level !== "log" || CONSOLE_TAP_PREFIX_RE.test(line)) {
        appendAppLogRingBuffer(level, line);
      }
    };

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.log = bind("log", origLog);
  console.warn = bind("warn", origWarn);
  console.error = bind("error", origError);
}

export function formatAppLogRingForCopy(rows: readonly AppLogRingEntry[]): string {
  return rows
    .map((row) => {
      const clock = new Date(row.at).toISOString().slice(11, 23);
      const tag = row.level === "log" ? "" : ` [${row.level}]`;
      return `${clock}${tag} ${row.text}`;
    })
    .join("\n");
}
