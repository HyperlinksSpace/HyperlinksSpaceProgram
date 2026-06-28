import { getDesktopSessionToken } from "./desktopSessionToken";
import { isDesktopAppShell } from "../ui/appShell";

const PATCHED = "__HSP_AUTH_FETCH_PATCHED__";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Attach `Authorization: Bearer` for `/api/*` when running in the Electron desktop shell. */
export function installDesktopAuthFetch(): void {
  if (!isDesktopAppShell() || typeof globalThis.fetch !== "function") return;
  const g = globalThis as typeof globalThis & { [PATCHED]?: boolean };
  if (g[PATCHED]) return;
  g[PATCHED] = true;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = getDesktopSessionToken();
    if (!token) return nativeFetch(input, init);

    const url = requestUrl(input);
    if (!url.includes("/api/")) return nativeFetch(input, init);

    const headers = new Headers(init?.headers);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return nativeFetch(input, {
      ...init,
      credentials: init?.credentials ?? "include",
      headers,
    });
  };
}
