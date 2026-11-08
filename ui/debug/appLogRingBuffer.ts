import { setAppLogRingSink } from "../../shared/appLog";

export type AppLogRingLevel = "log" | "warn" | "error";

export type AppLogRingEntry = {
  id: number;
  at: number;
  level: AppLogRingLevel;
  text: string;
};

const MAX_ENTRIES = 500;
let nextId = 1;
const entries: AppLogRingEntry[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function appendAppLogRingBuffer(level: AppLogRingLevel, text: string): void {
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
  emit();
}

export function clearAppLogRingBuffer(): void {
  entries.length = 0;
  emit();
}

export function getAppLogRingBufferSnapshot(): readonly AppLogRingEntry[] {
  return entries;
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
  setAppLogRingSink(appendAppLogRingBuffer);

  const bind =
    <K extends "log" | "warn" | "error">(level: K, original: (typeof console)[K]) =>
    (...args: unknown[]) => {
      original.apply(console, args as never);
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
