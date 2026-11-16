const IOS_OPEN_BODY_RACE_MS = 25_000;
const IOS_SCRIPT_BODY_MS = 8_000;
const IOS_GESTURE_XHR_MS = 22_000;

function promiseWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  code: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(code));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

declare global {
  interface Window {
    __hspHistoryDeliver?: (body: unknown) => void;
  }
}

function withIosScriptHistoryUrl(url: string): string {
  try {
    const parsed = new URL(
      url,
      typeof window !== "undefined" ? window.location.href : "https://localhost",
    );
    parsed.searchParams.set("ios_script", "1");
    return parsed.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}ios_script=1`;
  }
}

/**
 * Same-origin `<script src="...&ios_script=1">` — server calls `window.__hspHistoryDeliver`.
 * WKWebView on `/messages/chat` may never finish fetch/XHR; script execution still runs.
 */
function iosOpenHistoryScriptBody(
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; text: string; transport: "script" }> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("script_requires_document"));
      return;
    }
    const scriptUrl = withIosScriptHistoryUrl(url);
    const script = document.createElement("script");
    script.async = true;
    script.type = "text/javascript";
    script.charset = "utf-8";
    script.src = scriptUrl;
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      if (window.__hspHistoryDeliver === onDeliver) {
        delete window.__hspHistoryDeliver;
      }
      script.removeEventListener("error", onScriptError);
      script.remove();
    };
    let scriptTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (scriptTimer != null) clearTimeout(scriptTimer);
      cleanup();
      fn();
    };
    const onAbort = () => {
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    };
    const onScriptError = () => {
      finish(() => reject(new Error("ios_history_script_error")));
    };
    const onDeliver = (body: unknown) => {
      const row =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : null;
      const ok = row?.ok === true;
      const text = JSON.stringify(body ?? {});
      finish(() =>
        resolve({
          status: ok ? 200 : 502,
          text,
          transport: "script",
        }),
      );
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    window.__hspHistoryDeliver = onDeliver;
    script.addEventListener("error", onScriptError, { once: true });
    scriptTimer = setTimeout(() => {
      finish(() => reject(new Error("ios_history_script_timeout")));
    }, IOS_SCRIPT_BODY_MS);
    document.head.appendChild(script);
  });
}

/**
 * iOS gesture body: XHR first (list path), then script deliver — one at a time, bounded time.
 */
export async function iosGestureHistoryBodySingle(
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; text: string; transport: string }> {
  const attempts: Array<{
    label: string;
    run: () => Promise<{ status: number; text: string; transport: string }>;
  }> = [
    {
      label: "xhr",
      run: async () => {
        const xhr = await promiseWithTimeout(
          xhrGetWithCredentials(url, signal),
          IOS_GESTURE_XHR_MS,
          "ios_gesture_xhr_timeout",
        );
        return {
          status: xhr.status,
          text: xhr.text,
          transport: xhr.transport,
        };
      },
    },
    {
      label: "script",
      run: async () => {
        const body = await iosOpenHistoryScriptBody(url, signal);
        return {
          status: body.status,
          text: body.text,
          transport: body.transport,
        };
      },
    },
  ];
  let lastErr: unknown;
  for (const attempt of attempts) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      return await attempt.run();
    } catch (err) {
      lastErr = err;
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") || signal.aborted;
      if (aborted) throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("ios_gesture_body_exhausted");
}

/** @deprecated Parallel race — kept for experiments; prefer {@link iosGestureHistoryBodySingle}. */
const IOS_GESTURE_BODY_RACE_MS = 22_000;

export function raceIosGestureHistoryBody(
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; text: string; transport: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      fn();
    };
    const onAbort = () => {
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    void (async () => {
      try {
        const body = await iosOpenHistoryScriptBody(url, signal);
        finish(() =>
          resolve({
            status: body.status,
            text: body.text,
            transport: body.transport,
          }),
        );
      } catch {
        /* other lane may win */
      }
    })();
    void (async () => {
      try {
        const body = await xhrGetWithCredentials(url, signal);
        finish(() =>
          resolve({
            status: body.status,
            text: body.text,
            transport: body.transport,
          }),
        );
      } catch {
        /* other lane may win */
      }
    })();
    timer = setTimeout(() => {
      finish(() => reject(new Error("ios_gesture_body_timeout")));
    }, IOS_GESTURE_BODY_RACE_MS);
  });
}

/**
 * Script + XHR + fetch in parallel — WKWebView may never resolve fetch/XHR on `/messages/chat`;
 * take whichever body arrives first.
 */
export function raceIosOpenHistoryBody(
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; text: string; transport: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      fn();
    };

    const onAbort = () => {
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    void (async () => {
      try {
        const body = await iosOpenHistoryScriptBody(url, signal);
        finish(() =>
          resolve({
            status: body.status,
            text: body.text,
            transport: body.transport,
          }),
        );
      } catch {
        /* other lane may win */
      }
    })();

    void (async () => {
      try {
        const body = await iosForegroundHistoryGetText(url, signal);
        finish(() =>
          resolve({
            status: body.status,
            text: body.text,
            transport: body.transport,
          }),
        );
      } catch {
        /* other lane may win */
      }
    })();

    void (async () => {
      try {
        const response = await fetch(url, {
          method: "GET",
          credentials: "include",
          signal,
        });
        const text = await response.text();
        finish(() =>
          resolve({ status: response.status, text, transport: "fetch_open" }),
        );
      } catch {
        /* other lane may win */
      }
    })();

    timer = setTimeout(() => {
      finish(() => reject(new Error("ios_open_body_timeout")));
    }, IOS_OPEN_BODY_RACE_MS);
  });
}

/** iOS TMA: WKWebView often never resolves `fetch` on `/messages/chat`; XHR does. */
export async function iosForegroundHistoryGetText(
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; text: string; transport: "xhr" | "fetch" }> {
  if (typeof XMLHttpRequest !== "undefined") {
    try {
      return await xhrGetWithCredentials(url, signal);
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") || signal.aborted;
      if (aborted) throw err;
    }
  }
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    signal,
  });
  const text = await response.text();
  return { status: response.status, text, transport: "fetch" };
}

function xhrGetWithCredentials(
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; text: string; transport: "xhr" }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.withCredentials = true;
    xhr.responseType = "text";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => {
      finish(() => {
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
        reject(new DOMException("Aborted", "AbortError"));
      });
    };
    signal.addEventListener("abort", onAbort);
    xhr.onload = () => {
      finish(() => {
        resolve({
          status: xhr.status,
          text: typeof xhr.responseText === "string" ? xhr.responseText : "",
          transport: "xhr",
        });
      });
    };
    xhr.onerror = () => {
      finish(() => {
        reject(new Error("xhr_network_error"));
      });
    };
    xhr.ontimeout = () => {
      finish(() => {
        reject(new Error("xhr_timeout"));
      });
    };
    try {
      xhr.send();
    } catch (err) {
      finish(() => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    }
  });
}