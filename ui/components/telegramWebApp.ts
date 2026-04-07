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
  isFullscreen?: boolean;
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

/** In Telegram: platform is not "unknown" and user with id exists. In browser: otherwise. */
export function isActuallyInTelegram(): boolean {
  const app = getWebApp();
  if (!app) return false;
  try {
    const platform = app.platform;
    const unsafe = app.initDataUnsafe;
    const user = unsafe?.user;
    const hasValidUser =
      user != null &&
      typeof user === "object" &&
      "id" in user &&
      (user as { id?: unknown }).id != null;
    const ok =
      platform != null &&
      platform !== "unknown" &&
      hasValidUser;
    return !!ok;
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

export function getIsFullscreen(): boolean {
  const app = getWebApp();
  const v = app?.isFullscreen;
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

