import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { logPageDisplay } from "./pageDisplayLog";
import { getApiBaseUrl } from "../api/_base";
import { getDesktopOAuthBridge, isDesktopAppShell } from "./appShell";
import {
  isTelegramMiniAppEnvironment,
  openTelegramWebAppExternalLink,
} from "./components/telegramWebApp";

export type ExternalAuthOpenMethod =
  | "top_location_replace"
  | "top_location_href"
  | "anchor_top"
  | "window_open"
  | "linking"
  | "desktop_oauth_window"
  | "telegram_webapp_open_link";

export type ExternalAuthOpenResult = {
  method: ExternalAuthOpenMethod;
  ok?: boolean;
  error?: string | null;
  sessionToken?: string | null;
};

export type NavigateExternalAuthUrlOptions = {
  /**
   * In the Telegram Mini App, navigate this WebView to the authorize URL instead of
   * `WebApp.openLink`. Required so the OIDC callback `Set-Cookie` lands in the mini app.
   */
  keepInMiniAppWebView?: boolean;
};

function isInNestedFrame(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Open Telegram OIDC in the **top-level** browsing context.
 * Desktop: awaits the Electron oauth child window so the caller can apply the
 * session token and avoid leaving a second authenticated window open.
 * @see https://core.telegram.org/bots/telegram-login — Authorization Code + PKCE; URL must open in the user's browser, not a subframe.
 */
export async function openExternalAuthUrl(
  url: string,
  options?: NavigateExternalAuthUrlOptions,
): Promise<ExternalAuthOpenResult> {
  if (isDesktopAppShell()) {
    const bridge = getDesktopOAuthBridge();
    if (bridge) {
      const result = await bridge.openOAuthUrl(url, getApiBaseUrl());
      return {
        method: "desktop_oauth_window",
        ok: result?.ok !== false && !result?.error,
        error: result?.error ?? null,
        sessionToken: result?.sessionToken ?? null,
      };
    }
  }

  return { method: navigateExternalAuthUrl(url, options) };
}

/**
 * Sync navigate helper for non-desktop (and desktop fallback without bridge).
 * Prefer {@link openExternalAuthUrl} when a session token may be returned.
 */
export function navigateExternalAuthUrl(
  url: string,
  options?: NavigateExternalAuthUrlOptions,
): ExternalAuthOpenMethod {
  if (isDesktopAppShell()) {
    const bridge = getDesktopOAuthBridge();
    if (bridge) {
      void bridge.openOAuthUrl(url, getApiBaseUrl());
      return "desktop_oauth_window";
    }
  }

  if (typeof window === "undefined") {
    void Linking.openURL(url);
    return "linking";
  }

  const nestedFrame = isInNestedFrame();
  const inTelegramMiniApp = Platform.OS === "web" && isTelegramMiniAppEnvironment();
  logPageDisplay("welcome_telegram_oidc_navigate", {
    nestedFrame,
    inTelegramMiniApp,
    keepInMiniAppWebView: options?.keepInMiniAppWebView === true,
    urlHost: (() => {
      try {
        return new URL(url).host;
      } catch {
        return null;
      }
    })(),
    hasQuery: url.includes("?") && url.length > url.indexOf("?") + 1,
  });

  if (
    inTelegramMiniApp &&
    options?.keepInMiniAppWebView !== true &&
    openTelegramWebAppExternalLink(url)
  ) {
    return "telegram_webapp_open_link";
  }

  if (!nestedFrame) {
    window.location.replace(url);
    return "top_location_replace";
  }

  try {
    window.top!.location.href = url;
    return "top_location_href";
  } catch {
    // Cross-origin parent: cannot assign top.location from here.
  }

  if (typeof document !== "undefined") {
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_top";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return "anchor_top";
    } catch {
      // continue
    }
  }

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) {
    return "window_open";
  }

  void Linking.openURL(url);
  return "linking";
}

/** Always open in a new top-level tab/window on web (never replace current tab). */
export function openUrlInNewTabStrict(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const popup = window.open(trimmed, "_blank", "noopener,noreferrer");
    if (popup) {
      try {
        popup.opener = null;
      } catch {
        /* ignore */
      }
      return true;
    }
    if (typeof document !== "undefined") {
      const anchor = document.createElement("a");
      anchor.href = trimmed;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return true;
    }
  }

  void Linking.openURL(trimmed);
  return true;
}
