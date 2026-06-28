import { isDesktopAppShell } from "../ui/appShell";

const DESKTOP_SESSION_TOKEN_KEY = "hs_desktop_session_token_v1";

/** OAuth session token for Electron `app://` (cross-site cookies are not sent to the API). */
export function getDesktopSessionToken(): string | null {
  if (!isDesktopAppShell() || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DESKTOP_SESSION_TOKEN_KEY);
    const token = raw?.trim();
    return token || null;
  } catch {
    return null;
  }
}

export function setDesktopSessionToken(token: string): void {
  if (!isDesktopAppShell() || typeof window === "undefined") return;
  const trimmed = token.trim();
  if (!trimmed) return;
  try {
    window.localStorage.setItem(DESKTOP_SESSION_TOKEN_KEY, trimmed);
  } catch {
    // ignore storage failures
  }
}

export function clearDesktopSessionToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DESKTOP_SESSION_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function dispatchAuthSessionUpdated(): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent("hsp-auth-session-updated"));
}
