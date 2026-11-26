import { logPageDisplay } from "../pageDisplayLog";
import { isOnMessagesChatPath } from "../compactChatRouteGate";

const IOS_OPEN_BODY_RACE_MS = 45_000;
const IOS_SCRIPT_BODY_MS = 8_000;
/** Open chat on `/messages/chat` — TDLib body often lands after the 8s preview cap. */
const IOS_OPEN_SCRIPT_BODY_MS = 30_000;
const IOS_GESTURE_XHR_MS = 28_000;

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
  options?: { timeoutMs?: number },
): Promise<{ status: number; text: string; transport: "script" }> {
  const scriptWaitMs =
    typeof options?.timeoutMs === "number" && options.timeoutMs > 0
      ? Math.trunc(options.timeoutMs)
      : IOS_SCRIPT_BODY_MS;
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
      const count = Array.isArray(row?.messages) ? row.messages.length : 0;
      logPageDisplay("messages_history_ios_script_deliver", {
        ok,
        count,
        bytes: text.length,
      });
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
    }, scriptWaitMs);
    logPageDisplay("messages_history_ios_script_arm", {
      timeoutMs: scriptWaitMs,
    });
    document.head.appendChild(script);
  });
}

/**
 * Foreground open on iOS — one transport at a time (no parallel `fetch`, which can wedge WK).
 * Chat route: script deliver first; list/gesture tap: XHR then script.
 */
export async function iosOpenHistoryBody(
  url: string,
  signal: AbortSignal,
  options?: { preferScriptFirst?: boolean; scriptTimeoutMs?: number },
): Promise<{ status: number; text: string; transport: string }> {
  const scriptTimeoutMs =
    typeof options?.scriptTimeoutMs === "number" && options.scriptTimeoutMs > 0
      ? Math.trunc(options.scriptTimeoutMs)
      : IOS_OPEN_SCRIPT_BODY_MS;
  const xhrMs =
    options?.preferScriptFirst === true ? 12_000 : IOS_GESTURE_XHR_MS;
  const xhrAttempt: {
    label: string;
    run: () => Promise<{ status: number; text: string; transport: string }>;
  } = {
    label: "xhr",
    run: async () => {
      logPageDisplay("messages_history_ios_xhr_arm", { timeoutMs: xhrMs });
      const xhr = await promiseWithTimeout(
        xhrGetWithCredentials(url, signal),
        xhrMs,
        "ios_gesture_xhr_timeout",
      );
      return {
        status: xhr.status,
        text: xhr.text,
        transport: xhr.transport,
      };
    },
  };
  const scriptAttempt: {
    label: string;
    run: () => Promise<{ status: number; text: string; transport: string }>;
  } = {
    label: "script",
    run: async () => {
      const body = await iosOpenHistoryScriptBody(url, signal, {
        timeoutMs: scriptTimeoutMs,
      });
      return {
        status: body.status,
        text: body.text,
        transport: body.transport,
      };
    },
  };
  const attempts =
    options?.preferScriptFirst === true
      ? [scriptAttempt, xhrAttempt]
      : [xhrAttempt, scriptAttempt];
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

/** @deprecated Use {@link iosOpenHistoryBody}. */
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

/**
 * Telegram Web HTTP transport is XMLHttpRequest, and the chat draws from the
 * callback — not from an `async` continuation. WKWebView often never resumes
 * `await` after `fetch`/`script`. Deliver the body from `onload` / script
 * execution, and let the caller paint before this promise resolves.
 */
export function openIosTmaHistoryRace(
  url: string,
  signal: AbortSignal,
  onBody: (body: { status: number; text: string; transport: string }) => void,
): Promise<{ status: number; text: string; transport: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (
      body: { status: number; text: string; transport: string } | null,
      err?: unknown,
    ) => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      if (body) {
        try {
          onBody(body);
        } catch {
          /* paint errors must not drop the body */
        }
        resolve(body);
        return;
      }
      reject(err instanceof Error ? err : new Error("ios_tma_history_race_failed"));
    };
    if (signal.aborted) {
      finish(null, new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => finish(null, new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });

    let xhrDone = false;
    let scriptDone = false;
    let lastBody: { status: number; text: string; transport: string } | null = null;
    let armed = false;
    const countOf = (text: string) => {
      try {
        const parsed = JSON.parse(text) as { messages?: unknown[] };
        return Array.isArray(parsed.messages) ? parsed.messages.length : 0;
      } catch {
        return 0;
      }
    };
    const consider = (
      lane: "xhr" | "script",
      body: { status: number; text: string; transport: string } | null,
    ) => {
      if (settled) return;
      if (lane === "xhr") xhrDone = true;
      else scriptDone = true;
      if (body) lastBody = body;
      const count = body ? countOf(body.text) : 0;
      if (count > 0 && body) {
        finish(body);
        return;
      }
      if (xhrDone && scriptDone) {
        if (lastBody) finish(lastBody);
        else finish(null, new Error("ios_tma_history_race_failed"));
      }
    };

    const arm = () => {
      if (armed || settled) return;
      armed = true;
      if (waitTimer != null) {
        clearInterval(waitTimer);
        waitTimer = undefined;
      }
      logPageDisplay("messages_history_ios_xhr_arm", {
        timeoutMs: IOS_GESTURE_XHR_MS,
        onChatPath: isOnMessagesChatPath(),
      });
      void xhrGetWithCredentials(url, signal).then(
        (body) => {
          logPageDisplay("messages_history_ios_xhr_hit", {
            status: body.status,
            bytes: body.text.length,
          });
          consider("xhr", body);
        },
        () => consider("xhr", null),
      );
      void iosOpenHistoryScriptBody(url, signal, {
        timeoutMs: IOS_OPEN_SCRIPT_BODY_MS,
      }).then(
        (body) => consider("script", body),
        () => consider("script", null),
      );
    };

    let waitTimer: ReturnType<typeof setInterval> | undefined;
    if (isOnMessagesChatPath()) {
      arm();
    } else {
      const started = Date.now();
      logPageDisplay("messages_history_ios_route_wait", { onChatPath: false });
      waitTimer = setInterval(() => {
        if (settled) {
          if (waitTimer != null) clearInterval(waitTimer);
          return;
        }
        if (!isOnMessagesChatPath()) return;
        logPageDisplay("messages_history_ios_path_ready", {
          waitedMs: Date.now() - started,
          uiOpen: true,
        });
        arm();
      }, 32);
    }

    timer = setTimeout(() => {
      if (waitTimer != null) clearInterval(waitTimer);
      if (lastBody) finish(lastBody);
      else finish(null, new Error("ios_tma_text_timeout"));
    }, IOS_GESTURE_BODY_RACE_MS);
  });
}

/** @deprecated Parallel race — kept for experiments; prefer {@link iosGestureHistoryBodySingle}. */
const IOS_GESTURE_BODY_RACE_MS = 45_000;

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
        const body = await iosOpenHistoryScriptBody(url, signal, {
          timeoutMs: IOS_OPEN_SCRIPT_BODY_MS,
        });
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
        logPageDisplay("messages_history_ios_xhr_arm", {
          timeoutMs: IOS_GESTURE_XHR_MS,
        });
        const body = await promiseWithTimeout(
          xhrGetWithCredentials(url, signal),
          IOS_GESTURE_XHR_MS,
          "ios_gesture_xhr_timeout",
        );
        logPageDisplay("messages_history_ios_xhr_hit", {
          status: body.status,
          bytes: body.text.length,
        });
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
 * Stable `/messages/chat`: XHR + script only — parallel `fetch` wedges WK and stalls XHR.
 */
export function raceIosStableChatPathHistoryBody(
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; text: string; transport: string }> {
  logPageDisplay("messages_history_fetch_tma_path_xhr_script", {
    parallelFetch: false,
  });
  return raceIosGestureHistoryBody(url, signal);
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

    timer = setTimeout(() => {
      finish(() => reject(new Error("ios_open_body_timeout")));
    }, IOS_OPEN_BODY_RACE_MS);
  });
}

const IOS_OPEN_HISTORY_HARD_CAP_MS = 45_000;

/**
 * Never let open-history await hang past UI watchdog — cap the sequential body read.
 */
export function iosOpenHistoryBodyWithHardCap(
  url: string,
  signal: AbortSignal,
  options?: { preferScriptFirst?: boolean },
): Promise<{ status: number; text: string; transport: string }> {
  return promiseWithTimeout(
    iosOpenHistoryBody(url, signal, options),
    IOS_OPEN_HISTORY_HARD_CAP_MS,
    "ios_open_body_timeout",
  );
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
    xhr.timeout = IOS_GESTURE_XHR_MS;
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