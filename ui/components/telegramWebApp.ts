import { viewport } from "@tma.js/sdk-react";

/**
 * Client-only Telegram WebApp helpers (single source of truth for TMA data).
 * Aligned with Telegram Launch Parameters, Init Data, and Start Parameter docs:
 * - Launch params: in window.location.hash (tgWebAppData, tgWebAppVersion, etc.). Cached at launch.
 * - Start parameter: in URL query params (startattach or startapp), NOT in hash. Also in init data start_param.
 * - Allowed start param: A-Z, a-z, 0-9, _, -; max 512 chars. Validate with /^[\w-]{0,512}$/
 */

export type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: { id?: number; username?: string; [k: string]: unknown } };
  platform?: string;
  themeParams?: Record<string, string>;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setupSwipeBehavior?: (opts: { allow_vertical_swipe?: boolean }) => void;
  disableVerticalSwipes?: () => void;
  /** Immersive fullscreen (Bot API 8.0+), not the same as expanded height. */
  isFullscreen?: boolean;
  /** Mini app uses expanded viewport height (after expand()); distinct from isFullscreen. */
  isExpanded?: boolean;
  HapticFeedback?: { impactOccurred?: (style: string) => void };
  [k: string]: unknown;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

let cachedHashParams: URLSearchParams | null = null;
let cachedInitDataFromHash: string | null | undefined = undefined;

/** Clear cached launch params (e.g. hash was empty on first read, then populated). */
export function resetTelegramLaunchCache(): void {
  cachedHashParams = null;
  cachedInitDataFromHash = undefined;
}

/** Get launch params from URL hash. Cached on first read so hash routing doesn't lose them. */
function getLaunchParamsFromHash(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  if (cachedHashParams) return cachedHashParams;
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  cachedHashParams = new URLSearchParams(hash);
  return cachedHashParams;
}

/** Init data (tgWebAppData) from hash. Cached at launch per Telegram guide. */
function getInitDataFromHash(): string | null {
  if (cachedInitDataFromHash !== undefined) return cachedInitDataFromHash ?? null;
  const params = getLaunchParamsFromHash();
  // Do not cache "no hash yet" — first read can be before Mini App hash is present.
  if (params == null) {
    return null;
  }
  const raw = params.get("tgWebAppData") ?? null;
  const s = raw?.trim();
  cachedInitDataFromHash = s && s.length > 0 ? s : null;
  return cachedInitDataFromHash;
}

function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as Window).Telegram;
  const app = tg?.WebApp ?? null;
  return app;
}

/** True if we have WebApp object or init data in hash (launch params). */
export function isAvailable(): boolean {
  if (getWebApp() != null) return true;
  return getInitDataFromHash() != null;
}

/**
 * True when the page is (or will be) a Telegram Mini App session — do **not** start browser OIDC.
 * Broader than {@link isActuallyInTelegram}: includes launch hash / UA while initData is still loading.
 */
export function isTelegramMiniAppEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  if (isAvailable()) return true;
  try {
    const hash = window.location.hash ?? "";
    if (hash.includes("tgWebApp")) return true;
  } catch {
    /* ignore */
  }
  try {
    if ((window.navigator?.userAgent ?? "").toLowerCase().includes("telegram")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Load Telegram Web App script if missing (script is not auto-injected; page must include or load it). */
export function ensureTelegramScript(onLoad?: () => void): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if ((window as Window).Telegram?.WebApp) {
    onLoad?.();
    return;
  }

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src*="telegram.org/js/telegram-web-app"]',
  );
  if (existing) {
    if (existing.dataset.telegramWebAppLoaded === "1") {
      onLoad?.();
      return;
    }
    existing.addEventListener(
      "load",
      () => {
        existing.dataset.telegramWebAppLoaded = "1";
        onLoad?.();
      },
      { once: true },
    );
    return;
  }

  const script = document.createElement("script");
  script.src = "https://telegram.org/js/telegram-web-app.js";
  script.async = true;
  script.onload = () => {
    script.dataset.telegramWebAppLoaded = "1";
    onLoad?.();
  };
  document.head.appendChild(script);
}

/**
 * True when `WebApp.platform` is a real Telegram client name, not the stub `"unknown"`.
 * The official script sets `platform` to `"unknown"` outside Telegram (Electron, plain browser).
 */
export function isTelegramWebAppPlatformReal(): boolean {
  const app = getWebApp();
  const p = app?.platform;
  if (typeof p !== "string" || !p.trim()) return false;
  return p.trim() !== "unknown";
}

/** True after we start POST /api/telegram with initData (WebApp/hash can diverge later). */
let miniAppRegistrationStarted = false;

/** Call once when Mini App registration begins; keeps debug `inTelegram` aligned with backend flow. */
export function markMiniAppRegistrationStarted(): void {
  miniAppRegistrationStarted = true;
}

/**
 * Strong signal we're in a real Mini App session.
 * - Fast path: real `platform` + `initDataUnsafe.user` (when the bridge is fully synced).
 * - Otherwise: non-empty init data from `WebApp.initData` **or** `tgWebAppData` in the URL hash.
 *   Some clients keep `platform === "unknown"` and/or only populate hash launch params while `app.initData`
 *   is still empty — same init string is what we POST to `/api/telegram`, so treat it as in-session.
 */
export function isActuallyInTelegram(): boolean {
  if (miniAppRegistrationStarted) {
    return true;
  }
  const app = getWebApp();
  if (!app) return false;
  try {
    const platform = app.platform;
    const platformReal =
      platform != null &&
      typeof platform === "string" &&
      platform.trim() !== "" &&
      platform !== "unknown";

    const unsafe = app.initDataUnsafe;
    const user = unsafe?.user;
    const hasValidUser =
      user != null &&
      typeof user === "object" &&
      "id" in user &&
      (user as { id?: unknown }).id != null;

    if (platformReal && hasValidUser) {
      return true;
    }

    const initDataStr = getInitDataString();
    if (typeof initDataStr === "string" && initDataStr.trim().length > 0) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/** Init data: WebApp.initData first, then tgWebAppData from hash (per Launch Parameters guide). */
export function getInitDataString(): string | null {
  const app = getWebApp();
  if (app?.initData && typeof app.initData === "string") {
    const s = app.initData.trim();
    if (s.length > 0) return s;
  }
  return getInitDataFromHash();
}

export function getUser(): { id: number; username?: string; [k: string]: unknown } | null {
  const app = getWebApp();
  const user = app?.initDataUnsafe?.user;
  if (user == null || typeof user !== "object" || typeof (user as { id?: number }).id !== "number") {
    return null;
  }
  return user as { id: number; username?: string; [k: string]: unknown };
}

export function getPlatform(): string | null {
  const app = getWebApp();
  const p = app?.platform;
  return typeof p === "string" ? p : null;
}

export type ThemeParams = Record<string, string>;

/**
 * Theme colors from hash `tgWebAppThemeParams` only — does **not** include fullscreen (that is
 * `tgWebAppFullscreen` in the hash and/or live `WebApp.isFullscreen` / viewport).
 */
export function getThemeParamsFromLaunch(): ThemeParams | null {
  const params = getLaunchParamsFromHash();
  const raw = params?.get("tgWebAppThemeParams");
  if (!raw) return null;
  const trimmed = raw.trim();
  const candidates = [trimmed];
  try {
    const dec = decodeURIComponent(trimmed);
    if (dec !== trimmed) candidates.push(dec.trim());
  } catch {
    // ignore
  }
  for (const s of candidates) {
    if (!s) continue;
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") return parsed as ThemeParams;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function getThemeParamsFromWebApp(): ThemeParams | null {
  const app = getWebApp();
  const tp = app?.themeParams;
  return tp && typeof tp === "object" ? (tp as ThemeParams) : null;
}

/**
 * WebApp.themeParams first, then hash. Use after Mini App is ready (runTmaFlow, theme listeners).
 * Do not use for first-paint bootstrap: Telegram can briefly expose stale/default **dark**
 * `themeParams` before syncing the real client theme (e.g. light → dark flash).
 */
export function getInitialThemeParams(): ThemeParams | null {
  return getThemeParamsFromWebApp() ?? getThemeParamsFromLaunch();
}

/** Matches theme.ts ThemeColors shape; values are whatever Telegram sets (hex or rgb()). */
export type TelegramCssThemeColors = {
  background: string;
  primary: string;
  secondary: string;
};

/**
 * Telegram WebApp sets --tg-theme-* on documentElement (and sometimes body) before/while JS runs.
 * Use while React theme is not ready so we never paint our hard-coded "dark" app palette first.
 */
export function getThemeColorsFromTelegramCssVars(): TelegramCssThemeColors | null {
  if (typeof document === "undefined") return null;
  const roots = [document.documentElement, document.body];
  for (const el of roots) {
    const cs = getComputedStyle(el);
    const bg = cs.getPropertyValue("--tg-theme-bg-color").trim();
    const text = cs.getPropertyValue("--tg-theme-text-color").trim();
    const hint = cs.getPropertyValue("--tg-theme-hint-color").trim();
    if (bg) {
      return {
        background: bg,
        primary: text || "#000000",
        secondary: hint || "#818181",
      };
    }
  }
  return null;
}

function pickThemeParam(tp: ThemeParams | null | undefined, keys: string[]): string | null {
  if (!tp) return null;
  for (const k of keys) {
    const v = tp[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

/** Sync colors from a theme_params object (WebApp.themeParams or parsed launch JSON). */
export function getThemeColorsFromThemeParamsObject(
  tp: ThemeParams | null | undefined,
): TelegramCssThemeColors | null {
  const bg = pickThemeParam(tp, ["bg_color"]);
  if (!bg) return null;
  const text = pickThemeParam(tp, ["text_color", "link_color"]);
  const hint = pickThemeParam(tp, ["hint_color", "subtitle_text_color"]);
  return {
    background: bg,
    primary: text || "#000000",
    secondary: hint || "#818181",
  };
}

/** Same as theme_params on window.Telegram.WebApp — often populated before CSS vars resolve. */
export function getThemeColorsFromWebAppThemeParams(): TelegramCssThemeColors | null {
  return getThemeColorsFromThemeParamsObject(getThemeParamsFromWebApp());
}

/** Launch hash tgWebAppThemeParams — for pre-ready paint only (not for themeBgReady / scheme). */
export function getThemeColorsFromLaunchThemeParams(): TelegramCssThemeColors | null {
  return getThemeColorsFromThemeParamsObject(getThemeParamsFromLaunch());
}

/** Luminance of #RRGGBB (same threshold as Telegram.tsx theme classification). */
function luminanceFromHex(hex: string): number {
  const m = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return 0;
  const h = m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Text/placeholder color from launch theme params only (sync, first paint).
 * Matches app theme.ts light/dark primary when explicit colors are missing.
 */
export function getPrimaryTextColorFromLaunch(): string | null {
  const tp = getThemeParamsFromLaunch();
  if (!tp) return null;
  for (const key of ["text_color", "hint_color"] as const) {
    const v = tp[key];
    if (typeof v === "string" && /^#([0-9a-fA-F]{6})$/.test(v.trim())) {
      return v.trim();
    }
  }
  const bgRaw = tp.bg_color ?? tp.secondary_bg_color ?? tp.section_bg_color;
  if (typeof bgRaw === "string" && /^#([0-9a-fA-F]{6})$/.test(bgRaw.trim())) {
    const bg = bgRaw.trim();
    return luminanceFromHex(bg) < 128 ? "#FAFAFA" : "#111111";
  }
  return null;
}

/** Immersive fullscreen only; false when API omits the flag (expanded mini app is not fullscreen). */
export function getIsFullscreen(): boolean {
  const app = getWebApp();
  const v = app?.isFullscreen;
  return typeof v === "boolean" ? v : false;
}

/**
 * Raw `tgWebAppFullscreen` from the URL hash (Telegram adds this when opening in fullscreen).
 * Value may be empty; `null` if the key is missing.
 */
export function getTgWebAppFullscreenRawFromHash(): string | null {
  const params = getLaunchParamsFromHash();
  if (!params || !params.has("tgWebAppFullscreen")) return null;
  const v = params.get("tgWebAppFullscreen");
  if (v == null) return "";
  return String(v).trim();
}

/** True when launch hash includes fullscreen (key present; empty value counts as on). */
export function getLaunchHashFullscreenPositive(): boolean {
  const params = getLaunchParamsFromHash();
  if (!params || !params.has("tgWebAppFullscreen")) return false;
  const raw = params.get("tgWebAppFullscreen");
  if (raw == null) return true;
  const s = String(raw).trim();
  if (s === "") return true;
  const sl = s.toLowerCase();
  if (sl === "0" || sl === "false" || sl === "no" || sl === "off") return false;
  if (sl === "1" || sl === "true" || sl === "yes" || sl === "on") return true;
  return s.length > 0;
}

/**
 * Optional `fullscreen` flag from bridge `viewport_changed` (see Telegram viewport docs).
 * Launch hash may also carry `tgWebAppFullscreen` — see `getLaunchHashFullscreenPositive`.
 */
export function parseViewportChangedFullscreenFlag(payload: unknown): boolean | undefined {
  if (payload == null || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;
  for (const key of ["fullscreen", "isFullscreen", "is_fullscreen"] as const) {
    const v = p[key];
    if (typeof v === "boolean") return v;
  }
  return undefined;
}

/**
 * tma.js `viewport.isFullscreen` may be a signal/computed — unwrap for merges with WebApp.
 * Used only from {@link computeTelegramLayoutStartupSnapshot} and Telegram.tsx viewport sync.
 */
export function readTmaSdkViewportIsFullscreen(): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = viewport.isFullscreen as unknown;
    if (typeof raw === "boolean") return raw;
    if (raw && typeof raw === "object" && "value" in raw) {
      const v = (raw as { value: unknown }).value;
      if (typeof v === "boolean") return v;
    }
    if (typeof raw === "function") {
      const v = (raw as () => unknown)();
      if (typeof v === "boolean") return v;
    }
  } catch {
    // ignore (SDK not mounted / outside Mini App)
  }
  return undefined;
}

/**
 * Immersive fullscreen if Telegram.WebApp **or** the TMA SDK viewport **or** bridge
 * `viewport_changed` **or** launch hash `tgWebAppFullscreen` says so.
 * Important: do not use `viewport.isFullscreen ?? getIsFullscreen()` — when the SDK reports
 * `false`, we must still honor `WebApp.isFullscreen === true`.
 */
export function getIsImmersiveFullscreenMerged(
  viewportSdkIsFullscreen?: boolean | null,
  viewportBridgeFullscreen?: boolean | null,
): boolean {
  if (getIsFullscreen()) return true;
  if (viewportSdkIsFullscreen === true) return true;
  if (viewportBridgeFullscreen === true) return true;
  if (getLaunchHashFullscreenPositive()) return true;
  return false;
}

/**
 * Safe snapshot for console: hash param names, version/platform from launch, initData size,
 * live WebApp flags, and `tgWebAppFullscreen` from hash (not in tgWebAppData).
 */
export function getTmaInitAndWebAppDebugSnapshot(): Record<string, unknown> {
  if (typeof window === "undefined") {
    return { note: "no window" };
  }
  const params = getLaunchParamsFromHash();
  const hashParamNames = params ? Array.from(params.keys()) : [];
  const app = getWebApp();
  const initDataStr = getInitDataString();
  const hashFullscreenRaw = getTgWebAppFullscreenRawFromHash();
  return {
    hashParamNames,
    tgWebAppVersion: getWebAppVersionFromHash(),
    tgWebAppPlatformFromHash: getPlatformFromHash(),
    tgWebAppFullscreenFromHash: hashFullscreenRaw,
    launchHashFullscreenPositive: getLaunchHashFullscreenPositive(),
    mergedImmersiveFullscreenNow: getIsImmersiveFullscreenMerged(undefined, undefined),
    startParam: getStartParam(),
    initDataCharLength: typeof initDataStr === "string" ? initDataStr.length : 0,
    webAppPlatformLive: app?.platform,
    webAppIsFullscreenLive: getIsFullscreen(),
    webAppIsExpandedLive: getIsExpanded(),
    note:
      "Merged immersive fullscreen = WebApp.isFullscreen || SDK viewport || viewport_changed.fullscreen || launch hash tgWebAppFullscreen. Init data does not include fullscreen; hash may.",
  };
}

/** Subscribe to Bot API 8.0 `fullscreenChanged` (WebApp authoritative after event). */
export function attachFullscreenChangedListener(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const app = getWebApp() as unknown as {
    onEvent?: (eventType: string, cb: () => void) => void;
    offEvent?: (eventType: string, cb: () => void) => void;
  } | null;
  if (!app?.onEvent) return () => {};
  const handler = () => onChange();
  try {
    app.onEvent("fullscreenChanged", handler);
    return () => {
      try {
        app.offEvent?.("fullscreenChanged", handler);
      } catch {
        // ignore
      }
    };
  } catch {
    return () => {};
  }
}

/** Expanded to full mini-app height; default true when omitted (typical after expand()). */
export function getIsExpanded(): boolean {
  const app = getWebApp();
  const v = app?.isExpanded;
  return typeof v === "boolean" ? v : true;
}

export function triggerHaptic(style: string): void {
  if (!isActuallyInTelegram()) return;
  try {
    const app = getWebApp();
    app?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    // ignore
  }
}

/** Call ready(), expand(), set header color, disable vertical swipe. No-op if WebApp not loaded. */
export function readyAndExpand(): void {
  const app = getWebApp();
  if (!app) return;
  try {
    app.ready?.();
    app.expand?.();
    app.setHeaderColor?.("#000000");
    const opts = { allow_vertical_swipe: false };
    app.setupSwipeBehavior?.(opts);
    app.disableVerticalSwipes?.(); // legacy API; setupSwipeBehavior is preferred
  } catch {
    // ignore
  }
}

/** tgWebAppVersion from hash (e.g. "6.2"). Use to check method support. */
export function getWebAppVersionFromHash(): string | null {
  const params = getLaunchParamsFromHash();
  return params?.get("tgWebAppVersion") ?? null;
}

/** tgWebAppPlatform from hash. */
export function getPlatformFromHash(): string | null {
  const params = getLaunchParamsFromHash();
  return params?.get("tgWebAppPlatform") ?? null;
}

/** Start parameter: query (startattach/startapp) or launch param tgWebAppStartParam (query then hash; Telegram puts launch params in hash). Valid: A-Za-z0-9_- up to 512 chars. */
const START_PARAM_REGEX = /^[\w-]{0,512}$/;

export function getStartParam(): string | null {
  if (typeof window === "undefined") return null;
  const fromQuery = new URLSearchParams(window.location.search);
  const fromHash = getLaunchParamsFromHash();
  const raw =
    fromQuery.get("startattach") ??
    fromQuery.get("startapp") ??
    fromQuery.get("tgWebAppStartParam") ??
    fromHash?.get("tgWebAppStartParam") ??
    null;
  if (raw == null || typeof raw !== "string") return null;
  const s = raw.trim();
  return s.length > 0 && START_PARAM_REGEX.test(s) ? s : null;
}

/**
 * Mobile browser / WebView (e.g. Telegram Mini App on phone). False on SSR / non-browser.
 * Used to align header UX with the home page on mobile TMA.
 */
export function isMobileWebUserAgent(): boolean {
  if (typeof navigator === "undefined" || !navigator.userAgent) return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/** Layout / chrome: everything read in {@link computeTelegramLayoutStartupSnapshot}. */
export type TelegramLayoutStartupSnapshot = {
  readonly webAppPresent: boolean;
  readonly platformFromWebApp: string | null;
  readonly platformFromHash: string | null;
  /** Prefer live `WebApp.platform`, then `tgWebAppPlatform` from hash (before script loads). */
  readonly platformEffective: string | null;
  readonly webAppVersionFromHash: string | null;
  readonly isMobileWebUserAgent: boolean;
  /** Desktop-class TMA (Telegram Desktop, macOS, Unigram, or web on desktop UA). */
  readonly isTelegramMiniAppDesktop: boolean;
  readonly webAppIsExpanded: boolean;
  readonly webAppIsFullscreen: boolean;
  readonly launchHashFullscreenPositive: boolean;
  /** Same merge as theme/viewport code: WebApp + SDK viewport + launch hash. */
  readonly mergedImmersiveFullscreen: boolean;
  readonly startParam: string | null;
  /** Hash query contains any `tgWebApp*` launch key. */
  readonly hasTgWebAppInHash: boolean;
};

export function getEmptyTelegramLayoutStartupSnapshot(): TelegramLayoutStartupSnapshot {
  return {
    webAppPresent: false,
    platformFromWebApp: null,
    platformFromHash: null,
    platformEffective: null,
    webAppVersionFromHash: null,
    isMobileWebUserAgent: false,
    isTelegramMiniAppDesktop: false,
    webAppIsExpanded: true,
    webAppIsFullscreen: false,
    launchHashFullscreenPositive: false,
    mergedImmersiveFullscreen: false,
    startParam: null,
    hasTgWebAppInHash: false,
  };
}

function computePlatformEffective(web: string | null, hash: string | null): string | null {
  const w = web?.trim();
  if (w) return w;
  const h = hash?.trim();
  return h || null;
}

function computeIsTelegramMiniAppDesktop(platformEffective: string | null, mobileUa: boolean): boolean {
  const pe = platformEffective?.trim();
  if (!pe) {
    return !mobileUa;
  }
  const p = pe.toLowerCase();
  if (p === "ios" || p === "android") return false;
  if (p === "tdesktop" || p === "macos" || p === "unigram") return true;
  return !mobileUa;
}

/**
 * **Single entry point** for startup signals that affect layout (platform, UA, expanded/fullscreen merges,
 * start_param, hash presence). Read hash + WebApp + SDK viewport together; drive UI from React context.
 */
export function computeTelegramLayoutStartupSnapshot(): TelegramLayoutStartupSnapshot {
  if (typeof window === "undefined") {
    return getEmptyTelegramLayoutStartupSnapshot();
  }

  const app = getWebApp();
  const webAppPresent = app != null;
  const platformFromWebApp = typeof app?.platform === "string" ? app.platform : null;
  const params = getLaunchParamsFromHash();
  const platformFromHash = params?.get("tgWebAppPlatform") ?? null;
  const webAppVersionFromHash = params?.get("tgWebAppVersion") ?? null;
  const hasTgWebAppInHash = params
    ? Array.from(params.keys()).some((k) => k.startsWith("tgWebApp"))
    : false;

  const mobileUa = isMobileWebUserAgent();
  const platformEffective = computePlatformEffective(platformFromWebApp, platformFromHash);
  const isDesktop = computeIsTelegramMiniAppDesktop(platformEffective, mobileUa);

  const sdkFs = readTmaSdkViewportIsFullscreen();
  const mergedImmersive = getIsImmersiveFullscreenMerged(sdkFs, undefined);

  return {
    webAppPresent,
    platformFromWebApp,
    platformFromHash,
    platformEffective,
    webAppVersionFromHash,
    isMobileWebUserAgent: mobileUa,
    isTelegramMiniAppDesktop: isDesktop,
    webAppIsExpanded: getIsExpanded(),
    webAppIsFullscreen: getIsFullscreen(),
    launchHashFullscreenPositive: getLaunchHashFullscreenPositive(),
    mergedImmersiveFullscreen: mergedImmersive,
    startParam: getStartParam(),
    hasTgWebAppInHash,
  };
}

/** Prefer `useTelegram().layoutStartup.isTelegramMiniAppDesktop`. Uses {@link computeTelegramLayoutStartupSnapshot}. */
export function isTelegramMiniAppDesktopContext(): boolean {
  return computeTelegramLayoutStartupSnapshot().isTelegramMiniAppDesktop;
}

/**
 * When to show the default global logo bar on `/welcome` inside TMA.
 * Only **immersive** fullscreen (`WebApp.isFullscreen` / merged viewport) — not expanded “fullsize” alone.
 * On fullsize-without-immersive, the welcome screen uses the marketing header instead.
 */
export function showGlobalLogoBarOnWelcomeTma(isInTelegram: boolean, isFullscreen: boolean): boolean {
  if (!isInTelegram) return false;
  return isFullscreen;
}

