type AnyRequest = Request | { method?: string; headers?: Record<string, string | string[] | undefined>; url?: string };

function getHeader(request: AnyRequest, name: string): string | null {
  const lower = name.toLowerCase();
  const webHeaders = (request as Request).headers as Headers | undefined;
  if (webHeaders && typeof webHeaders.get === "function") {
    return webHeaders.get(name);
  }
  const nodeHeaders = (request as { headers?: Record<string, string | string[] | undefined> }).headers;
  if (!nodeHeaders) return null;
  const raw = nodeHeaders[lower];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === "string" ? raw : null;
}

function requestMethod(request: AnyRequest): string {
  return ((request as { method?: string }).method ?? (request as Request).method ?? "GET").toUpperCase();
}

/** Preflight for welcome / desktop OAuth API calls (`app://` → deployed API). */
export function authApiPreflightResponse(request: AnyRequest): Response | null {
  if (requestMethod(request) !== "OPTIONS") return null;
  const headers = new Headers();
  applyAuthApiCors(request, headers);
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers });
}

export function applyAuthApiCors(request: AnyRequest, headers: Headers): void {
  const origin = getHeader(request, "origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
}
