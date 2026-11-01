import { getDesktopSessionToken } from "./desktopSessionToken";
import { getApiBaseUrl } from "../api/_base";
import { getDesktopOAuthBridge, isDesktopAppShell } from "../ui/appShell";
import { logPageDisplay } from "../ui/pageDisplayLog";

const PATCHED = "__HSP_AUTH_FETCH_PATCHED__";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function plainHeaders(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = { Accept: "application/json" };
  const raw = init?.headers;
  if (!raw) return out;
  if (typeof Headers !== "undefined" && raw instanceof Headers) {
    raw.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, string>)) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

/**
 * Only our backend (`getApiBaseUrl()/api/...`) should get Bearer + credentials.
 * Matching any URL that contains `/api/` also hits tokens.swap.coffee/api/v3 and
 * forces credentials:include, which Chromium rejects when ACAO is `*`
 * (prod: desktop "Failed to fetch" / Loading tokens).
 */
function isOurBackendApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes("/api")) return false;
    const base = getApiBaseUrl();
    if (!base) return false;
    return parsed.origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function logDesktopAuthFetch(
  url: string,
  details: Record<string, unknown>,
): void {
  try {
    const path = new URL(url).pathname;
    if (!path.startsWith("/api/auth")) return;
  } catch {
    return;
  }
  logPageDisplay("desktop_auth_api_fetch", details);
}

/** Attach `Authorization: Bearer` for our `/api/*` when running in the Electron desktop shell. */
export function installDesktopAuthFetch(): void {
  if (!isDesktopAppShell() || typeof globalThis.fetch !== "function") return;
  const g = globalThis as typeof globalThis & { [PATCHED]?: boolean };
  if (g[PATCHED]) return;
  g[PATCHED] = true;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    if (!isOurBackendApiUrl(url)) {
      return nativeFetch(input, init);
    }

    const token = getDesktopSessionToken();
    const bridge = getDesktopOAuthBridge();

    if (bridge?.fetchProgramApi) {
      logDesktopAuthFetch(url, {
        transport: "ipc_program_api",
        hasStoredToken: Boolean(token),
        method: (init?.method || "GET").toUpperCase(),
      });
      return bridge
        .fetchProgramApi(url, {
          method: init?.method,
          headers: plainHeaders(init),
          body: typeof init?.body === "string" ? init.body : undefined,
          bearerToken: token ?? undefined,
          timeoutMs: 60_000,
        })
        .then((result) => {
          if (!result.ok) {
            logDesktopAuthFetch(url, {
              transport: "ipc_program_api",
              error: result.error,
            });
            throw new Error(result.error || "program API fetch failed");
          }
          logDesktopAuthFetch(url, {
            transport: "ipc_program_api",
            status: result.status,
            ipcBearer: result.debug?.bearer ?? null,
            ipcSessionCookie: result.debug?.sessionCookie ?? null,
          });
          return new Response(result.body || "", {
            status: result.status || 200,
            headers: { "Content-Type": "application/json" },
          });
        });
    }

    logDesktopAuthFetch(url, {
      transport: "renderer_fetch",
      hasStoredToken: Boolean(token),
      attachedBearer: Boolean(token),
      method: (init?.method || "GET").toUpperCase(),
    });

    if (!token) return nativeFetch(input, init);

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
