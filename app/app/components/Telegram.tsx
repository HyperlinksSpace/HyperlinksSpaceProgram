import { createContext, useContext, useEffect, useRef, useState } from "react";
import { init, on, viewport } from "@tma.js/sdk-react";
import {
  ensureTelegramScript,
  getInitDataString,
  getStartParam,
  getInitialThemeParams,
  isAvailable,
  readyAndExpand,
  triggerHaptic as triggerHapticImpl,
} from "./telegramWebApp";
import { buildApiUrl } from "../../api/base";

let sdkInitialized = false;
function ensureSdkInitialized() {
  if (sdkInitialized) return;
  if (typeof window === "undefined") return;
  try {
    init();
    sdkInitialized = true;
  } catch {
    // ignore (e.g. outside Mini App when running locally)
  }
}

if (typeof window !== "undefined") {
  ensureSdkInitialized();
}

/** True if we're likely inside Telegram Mini App (avoid tma.js viewport calls when false). */
function isLikelyInTma(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!(window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp;
  } catch {
    return false;
  }
}

type TelegramStatus = "idle" | "loading" | "ok" | "error" | "dev";

export type TelegramDebugInfo = {
  hasWebApp: boolean;
  webAppPollCount: number;
  initDataLength: number | null;
  pollCount: number;
  apiStatus: number | null;
  apiMessage: string | null;
  /** URL we POST to (to verify origin/routing). */
  apiUrl: string | null;
  /** Ms from fetch start to response or timeout. */
  fetchDurationMs: number | null;
  /** Last client log line for investigation. */
  lastLog: string | null;
};

export type TelegramContextValue = {
  status: TelegramStatus;
  telegramUsername: string | null;
  error: string | null;
  isInTelegram: boolean;
  /** "dark" | "light" per Telegram theme; dark is default/fallback. */
  colorScheme: "dark" | "light";
  triggerHaptic: (style: string) => void;
  safeAreaInsetTop: number;
  contentSafeAreaInsetTop: number;
  isFullscreen: boolean;
  /** Start param from launch (query or hash). Valid per Telegram: A-Za-z0-9_- up to 512 chars. */
  startParam: string | null;
  /** On-screen debug (no console needed in TMA). */
  debug: TelegramDebugInfo;
};

const defaultDebug: TelegramDebugInfo = {
  hasWebApp: false,
  webAppPollCount: 0,
  initDataLength: null,
  pollCount: 0,
  apiStatus: null,
  apiMessage: null,
  apiUrl: null,
  fetchDurationMs: null,
  lastLog: null,
};

const WEBAPP_POLL_MS = 100;
const WEBAPP_POLL_MAX = 50; // 5s wait for Telegram to inject WebApp

const defaultContext: TelegramContextValue = {
  status: "idle",
  telegramUsername: null,
  error: null,
  isInTelegram: false,
  colorScheme: "dark",
  triggerHaptic: () => {},
  safeAreaInsetTop: 0,
  contentSafeAreaInsetTop: 0,
  isFullscreen: true,
  startParam: null,
  debug: defaultDebug,
};

const TelegramContext = createContext<TelegramContextValue>(defaultContext);

export function useTelegram() {
  return useContext(TelegramContext);
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<TelegramStatus>("idle");
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<TelegramDebugInfo>(defaultDebug);
  const hasRegisteredRef = useRef(false);
  const initPollCleanupRef = useRef<(() => void) | null>(null);

  const [safeAreaInsetTop, setSafeAreaInsetTop] = useState(0);
  const [contentSafeAreaInsetTop, setContentSafeAreaInsetTop] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [colorScheme, setColorScheme] = useState<"dark" | "light">("dark");

  function classifyThemeFromBgColor(bgColor: string | undefined | null): "dark" | "light" {
    if (!bgColor || typeof bgColor !== "string") return "dark";
    const m = bgColor.match(/^#([0-9a-fA-F]{6})$/);
    if (!m) return "dark";
    const hex = m[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    // Perceptual luminance approximation; threshold picked to clearly separate Telegram dark vs light palettes.
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const scheme = luminance < 128 ? "dark" : "light";
    // Debug log to see classification in TMA console
    // eslint-disable-next-line no-console
    console.log("[TMA theme] classify", { bgColor, luminance, scheme });
    return scheme;
  }

  useEffect(() => {
    if (!isLikelyInTma()) return;
    try {
      ensureSdkInitialized();
      viewport.mount?.();
      setSafeAreaInsetTop(viewport.safeAreaInsetTop ?? 0);
      setContentSafeAreaInsetTop(viewport.contentSafeAreaInsetTop ?? 0);
      setIsFullscreen(viewport.isFullscreen ?? true);
    } catch {
      // outside Mini App (e.g. local dev) — leave defaults
    }
  }, []);

  // TMA-only: layout height and scroll come from TMA. When keyboard opens,
  // nothing changes until TMA sends viewport_changed; theme updates are
  // handled via useThemeParams above.
  useEffect(() => {
    if (typeof window === "undefined" || !isLikelyInTma()) return;

    // iOS: viewport-fit=cover avoids white gap at bottom when keyboard opens
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      const c = meta.getAttribute("content") ?? "";
      if (!c.includes("viewport-fit=cover")) {
        meta.setAttribute("content", [c, "viewport-fit=cover"].filter(Boolean).join(", "));
      }
    }

    function lockScroll() {
      if (window.scrollY > 0) window.scrollTo(0, 0);
    }
    window.addEventListener("scroll", lockScroll, { passive: false });

    let tmaCleanup: (() => void) | null = null;
    viewport.mount?.().then(() => {
      try {
        const unbindCss = viewport.bindCssVars?.();
        // viewport_changed (height, width?, is_expanded, is_state_stable). Only reset scroll when state is stable.
        const removeViewportListener = on(
          "viewport_changed",
          (payload: {
            height: number;
            width?: number;
            is_expanded?: boolean;
            is_state_stable?: boolean;
            isExpanded?: boolean;
            isStateStable?: boolean;
          }) => {
            const stable = payload.is_state_stable ?? payload.isStateStable ?? false;
            if (stable) window.scrollTo(0, 0);
          }
        );

        tmaCleanup = () => {
          unbindCss?.();
          removeViewportListener?.();
        };
      } catch {
        // ignore
      }
    });

    return () => {
      window.removeEventListener("scroll", lockScroll);
      tmaCleanup?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDebug((d) => ({ ...d, hasWebApp: false, apiMessage: "no window" }));
      setStatus("dev");
      return;
    }

    setStatus("loading");
    ensureTelegramScript();

    const API_TIMEOUT_MS = 15000;
    const LOG_PREFIX = "[TMA register]";

    function registerWithBackend(initData: string) {
      if (hasRegisteredRef.current) return;
      hasRegisteredRef.current = true;

      const url = buildApiUrl("/api/telegram");
      const fetchStartedAt = Date.now();

      setDebug((d) => ({
        ...d,
        initDataLength: initData.length,
        apiUrl: url,
        fetchDurationMs: null,
        lastLog: "fetch start",
      }));
      console.log(`${LOG_PREFIX} fetch start url=${url} initDataLength=${initData.length}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timeoutId);
          const durationMs = Date.now() - fetchStartedAt;
          const json = await res.json().catch(() => ({}));
          const apiMsg = json?.error ?? (json?.ok ? "ok" : String(res.status));

          setDebug((d) => ({
            ...d,
            apiStatus: res.status,
            apiMessage: apiMsg,
            fetchDurationMs: durationMs,
            lastLog: `status ${res.status} ${durationMs}ms`,
          }));
          console.log(`${LOG_PREFIX} response status=${res.status} durationMs=${durationMs} body=${apiMsg}`);

          if (!res.ok || !json?.ok) {
            throw new Error(json?.error || `HTTP ${res.status}`);
          }
          setTelegramUsername(json.telegram_username ?? null);
          setStatus("ok");
        })
        .catch((e) => {
          clearTimeout(timeoutId);
          const durationMs = Date.now() - fetchStartedAt;
          const isTimeout = e?.name === "AbortError";
          const msg = isTimeout ? "timeout" : e?.message ?? "fetch error";
          const lastLog = isTimeout
            ? `timeout after ${durationMs}ms`
            : `error ${durationMs}ms: ${msg}`;

          setDebug((d) => ({
            ...d,
            apiStatus: null,
            apiMessage: msg,
            fetchDurationMs: durationMs,
            lastLog,
          }));
          console.error(`${LOG_PREFIX} failed ${lastLog}`, e);

          setError(isTimeout ? "Request timed out" : (e?.message ?? "Failed to register Telegram user"));
          setStatus("error");
        });
    }

    function runTmaFlow(): () => void {
      readyAndExpand();

      // Initial theme: try WebApp.themeParams or tgWebAppThemeParams launch param.
      try {
        const tp = getInitialThemeParams();
        const bg =
          tp?.bg_color ?? tp?.secondary_bg_color ?? tp?.section_bg_color;
        // eslint-disable-next-line no-console
        console.log("[TMA theme] initial themeParams", tp, "bg:", bg);
        setColorScheme(classifyThemeFromBgColor(bg));
      } catch {
        // ignore; keep default "dark"
      }

      let initDataStr = getInitDataString();
      if (initDataStr) {
        registerWithBackend(initDataStr);
        return () => {};
      }
      let pollCount = 0;
      const initInterval = setInterval(() => {
        pollCount += 1;
        setDebug((d) => ({ ...d, pollCount }));
        initDataStr = getInitDataString();
        if (initDataStr) {
          clearInterval(initInterval);
          registerWithBackend(initDataStr);
        }
      }, WEBAPP_POLL_MS);
      return () => clearInterval(initInterval);
    }

    let webAppPollCount = 0;
    const webAppInterval = setInterval(() => {
      webAppPollCount += 1;
      setDebug((d) => ({ ...d, webAppPollCount }));

      if (isAvailable()) {
        clearInterval(webAppInterval);
        setDebug((d) => ({ ...d, hasWebApp: true }));
        initPollCleanupRef.current = runTmaFlow();
        return;
      }

      if (webAppPollCount >= WEBAPP_POLL_MAX) {
        clearInterval(webAppInterval);
        setDebug((d) => ({ ...d, apiMessage: "no WebApp (timeout)" }));
        setStatus("dev");
      }
    }, WEBAPP_POLL_MS);

    return () => {
      clearInterval(webAppInterval);
      initPollCleanupRef.current?.();
    };
  }, []);

  const isInTelegram = status !== "dev";

  const value: TelegramContextValue = {
    status,
    telegramUsername,
    error,
    isInTelegram,
    colorScheme,
    triggerHaptic: triggerHapticImpl,
    safeAreaInsetTop,
    contentSafeAreaInsetTop,
    isFullscreen,
    startParam: getStartParam(),
    debug,
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
}
