import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { init, on, viewport } from "@tma.js/sdk-react";
import { on as onBridge } from "@tma.js/bridge";
import {
  ensureTelegramScript,
  getInitDataString,
  getStartParam,
  getInitialThemeParams,
  getPlatformFromHash,
  getThemeParamsFromLaunch,
  getWebAppVersionFromHash,
  isAvailable,
  readyAndExpand,
  resetTelegramLaunchCache,
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

/** Sync signals only (hash / UA / WebApp presence). Do not use for API calls. */
function isTelegramLikelyAtStartup(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (getThemeParamsFromLaunch() != null) return true;
  } catch {
    // ignore
  }
  try {
    const hash = window.location.hash ?? "";
    if (hash.includes("tgWebApp")) return true;
  } catch {
    // ignore
  }
  try {
    if (getPlatformFromHash() != null || getWebAppVersionFromHash() != null) return true;
  } catch {
    // ignore
  }
  try {
    const ua = (window.navigator?.userAgent ?? "").toLowerCase();
    if (ua.includes("telegram")) return true;
  } catch {
    // ignore
  }
  return isAvailable();
}

function normalizeHexBg(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (/^#([0-9a-fA-F]{6})$/.test(s)) return s;
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(s);
  if (m3) {
    const x = m3[1];
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toLowerCase();
  }
  return null;
}

/**
 * Only `bg_color` defines the main chat background in Telegram theme_params.
 * Do NOT fall back to secondary_bg_color / section_bg_color for light/dark app scheme:
 * those can be dark panels while the client is in light mode → false "dark" + flash.
 */
function getBgColorForScheme(tp: Record<string, string> | null | undefined): string | null {
  if (!tp) return null;
  return normalizeHexBg(tp.bg_color);
}

function classifyThemeFromBgColor(bgColor: string | undefined | null): "dark" | "light" {
  if (!bgColor || typeof bgColor !== "string") return "dark";
  const m = bgColor.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return "dark";
  const hex = m[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const scheme = luminance < 128 ? "dark" : "light";
  // eslint-disable-next-line no-console
  console.log("[TMA theme] classify", { bgColor: bgColor.trim(), luminance, scheme });
  return scheme;
}

/** Mini App when hash/UA says so OR init data / WebApp is present (isAvailable). */
function isMiniAppContext(): boolean {
  return isTelegramLikelyAtStartup() || isAvailable();
}

function initialColorSchemeFromBootstrap(): "dark" | "light" {
  // Real scheme comes from Telegram.WebApp in runTmaFlow — never from launch hash (hash bg_color
  // can disagree with WebApp and flash dark before "initial themeParams bg: #ffffff").
  return "dark";
}

function initialThemeBgReadyFromBootstrap(): boolean {
  // Must match server + client. SSR returned true here while client used false → React #418 + wrong tree.
  return false;
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
  /**
   * Use Telegram palette (launch + colorScheme) — true when in Mini App context OR status is not dev.
   * Differs from isInTelegram when status is "dev" but tgWebApp hash/init data exists (theme.ts must not force dark).
   */
  useTelegramTheme: boolean;
  /** "dark" | "light" per Telegram theme; dark is default/fallback. */
  colorScheme: "dark" | "light";
  /** True once we have a valid Telegram theme bg_color and can safely paint our custom palette. */
  themeBgReady: boolean;
  /** False on SSR/first paint, true after client mount — keeps useColors in sync with server HTML (hydration). */
  clientHydrated: boolean;
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
  useTelegramTheme: false,
  colorScheme: "dark",
  themeBgReady: false,
  clientHydrated: false,
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
  /** Block SDK/bridge theme events until runTmaFlow has applied WebApp theme (avoids stale dark WebApp). */
  const tmaInitialThemeResolvedRef = useRef(false);

  const [safeAreaInsetTop, setSafeAreaInsetTop] = useState(0);
  const [contentSafeAreaInsetTop, setContentSafeAreaInsetTop] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [colorScheme, setColorScheme] = useState<"dark" | "light">(initialColorSchemeFromBootstrap);

  // Client starts hidden (themeBgReady false) until plain-web unlock (useLayoutEffect) or TMA runTmaFlow.
  const [themeBgReady, setThemeBgReady] = useState<boolean>(initialThemeBgReadyFromBootstrap);
  const [clientHydrated, setClientHydrated] = useState(false);
  useEffect(() => {
    setClientHydrated(true);
  }, []);

  // Plain web: unlock immediately. TMA: do NOT paint from launch hash — it can mismatch WebApp
  // (dark classify in hash vs bg #ffffff in WebApp); only runTmaFlow uses WebApp.themeParams.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    function unlockPlainWebIfNeeded(): void {
      resetTelegramLaunchCache();
      if (isMiniAppContext()) return;
      setThemeBgReady(true);
    }
    unlockPlainWebIfNeeded();
    const raf = requestAnimationFrame(() => unlockPlainWebIfNeeded());
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hash changes: re-read WebApp (authoritative), not tgWebAppThemeParams from hash alone.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMiniAppContext()) return;
    const onHashChange = () => {
      resetTelegramLaunchCache();
      const bg = getBgColorForScheme(getInitialThemeParams());
      if (bg) {
        setColorScheme(classifyThemeFromBgColor(bg));
        setThemeBgReady(true);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Live theme updates: SDK + bridge + native WebApp (no polling).
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cleanupSdk: (() => void) | undefined;
    let cleanupBridge: (() => void) | undefined;
    let cleanupNative: (() => void) | undefined;
    let nativeAttached = false;

    function updateScheme(next: "dark" | "light") {
      setColorScheme((prev) => {
        if (prev === next) return prev;
        // eslint-disable-next-line no-console
        console.log("[TMA theme] update colorScheme", { from: prev, to: next });
        return next;
      });
    }

    function markThemeBgReady(): void {
      setThemeBgReady((prev) => {
        if (prev) return prev;
        // eslint-disable-next-line no-console
        console.log("[TMA theme] themeBgReady=true");
        return true;
      });
    }

    function applyFromWebApp(): void {
      if (!tmaInitialThemeResolvedRef.current) return;
      const tp = getInitialThemeParams();
      const bg = getBgColorForScheme(tp);
      if (!bg) return;
      const scheme = classifyThemeFromBgColor(bg);
      updateScheme(scheme);
      markThemeBgReady();
    }

    function computeSchemeFromPayload(payload: unknown): void {
      if (!tmaInitialThemeResolvedRef.current) return;
      const anyPayload = payload as unknown as {
        color_scheme?: string;
        theme_params?: Record<string, string>;
      } | null;

      const explicit = anyPayload?.color_scheme;
      if (explicit === "dark" || explicit === "light") {
        updateScheme(explicit);
        markThemeBgReady();
        return;
      }

      const tp = anyPayload?.theme_params;
      const bg = getBgColorForScheme(tp);
      if (!bg) return;
      const scheme = classifyThemeFromBgColor(bg);
      updateScheme(scheme);
      markThemeBgReady();
    }

    function tryAttachNativeThemeOnce(): void {
      if (nativeAttached) return;
      try {
        const app = (window as Window).Telegram?.WebApp as unknown as {
          onEvent?: (eventType: string, cb: () => void) => void;
          offEvent?: (eventType: string, cb: () => void) => void;
        } | null;
        if (!app || typeof app.onEvent !== "function") return;

        const handler = () => applyFromWebApp();
        app.onEvent("themeChanged", handler);
        nativeAttached = true;
        cleanupNative = () => {
          try {
            if (typeof app.offEvent === "function") {
              app.offEvent("themeChanged", handler);
            }
          } catch {
            // ignore
          }
        };
      } catch {
        // ignore
      }
    }

    try {
      ensureSdkInitialized();
      cleanupSdk = on("theme_changed", (payload) => computeSchemeFromPayload(payload));
    } catch {
      // ignore
    }

    try {
      cleanupBridge = onBridge("theme_changed", (payload) =>
        computeSchemeFromPayload(payload),
      );
    } catch {
      // ignore
    }

    if (isTelegramLikelyAtStartup()) {
      tryAttachNativeThemeOnce();
      ensureTelegramScript(() => tryAttachNativeThemeOnce());
    }

    return () => {
      try {
        cleanupSdk?.();
      } catch {
        // ignore
      }
      try {
        cleanupBridge?.();
      } catch {
        // ignore
      }
      try {
        cleanupNative?.();
      } catch {
        // ignore
      }
    };
  }, []);

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

      // Initial theme: WebApp first (matches Telegram UI). Launch hash can disagree → dark flash.
      try {
        const launchTp = getThemeParamsFromLaunch();
        const webTp = getInitialThemeParams();
        const bg = getBgColorForScheme(webTp) ?? getBgColorForScheme(launchTp);
        // eslint-disable-next-line no-console
        console.log("[TMA theme] initial themeParams", { launch: launchTp, web: webTp }, "bg:", bg);
        if (bg) {
          setColorScheme(classifyThemeFromBgColor(bg));
          setThemeBgReady((prev) => {
            if (prev) return prev;
            // eslint-disable-next-line no-console
            console.log("[TMA theme] themeBgReady=true");
            return true;
          });
        }
      } catch {
        // ignore; keep default "dark"
      } finally {
        tmaInitialThemeResolvedRef.current = true;
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
    let webAppInterval: ReturnType<typeof setInterval> | undefined;

    function tryAttachWebApp(): boolean {
      if (!isAvailable()) return false;
      if (webAppInterval != null) {
        clearInterval(webAppInterval);
        webAppInterval = undefined;
      }
      setDebug((d) => ({ ...d, hasWebApp: true }));
      initPollCleanupRef.current = runTmaFlow();
      return true;
    }

    // Run once immediately — avoids extra 100ms dark frame while waiting for first interval tick.
    if (!tryAttachWebApp()) {
      webAppInterval = setInterval(() => {
        webAppPollCount += 1;
        setDebug((d) => ({ ...d, webAppPollCount }));

        if (tryAttachWebApp()) return;

        if (webAppPollCount >= WEBAPP_POLL_MAX) {
          if (webAppInterval != null) clearInterval(webAppInterval);
          webAppInterval = undefined;
          setDebug((d) => ({ ...d, apiMessage: "no WebApp (timeout)" }));
          setStatus("dev");
        }
      }, WEBAPP_POLL_MS);
    }

    return () => {
      if (webAppInterval != null) clearInterval(webAppInterval);
      initPollCleanupRef.current?.();
    };
  }, []);

  // Plain web only: after WebApp poll times out we set status "dev" — ensure UI is visible.
  // Do not force themeBgReady in Mini App (would show dark before runTmaFlow applies launch theme).
  useEffect(() => {
    if (status !== "dev") return;
    if (isMiniAppContext()) return;
    setThemeBgReady(true);
  }, [status]);

  const isInTelegram = status !== "dev";
  const useTelegramTheme =
    status !== "dev" ||
    (typeof window !== "undefined" && (isTelegramLikelyAtStartup() || isAvailable()));

  const value: TelegramContextValue = {
    status,
    telegramUsername,
    error,
    isInTelegram,
    useTelegramTheme,
    colorScheme,
    themeBgReady,
    clientHydrated,
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
