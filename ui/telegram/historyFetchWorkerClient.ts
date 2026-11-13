/**
 * Telegram Web A loads MTProto in a worker so the main thread never blocks on
 * the body. Same idea here: fetch + read text off-thread, normalize on main in
 * the worker message callback.
 */
type WorkerResult = {
  status: number;
  text: string;
};

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<
  string,
  { resolve: (value: WorkerResult) => void; reject: (reason: Error) => void }
>();

function ensureHistoryFetchWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  const workerSource = `
self.onmessage = async function (event) {
  const data = event.data;
  if (!data || typeof data.requestId !== "string" || typeof data.url !== "string") return;
  try {
    const response = await fetch(data.url, { method: "GET", credentials: "include" });
    const text = await response.text();
    self.postMessage({
      requestId: data.requestId,
      ok: true,
      status: response.status,
      text,
    });
  } catch (err) {
    self.postMessage({
      requestId: data.requestId,
      ok: false,
      message: err && err.message ? String(err.message) : String(err),
    });
  }
};
`;
  try {
    worker = new Worker(
      URL.createObjectURL(new Blob([workerSource], { type: "application/javascript" })),
    );
    worker.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as {
        requestId?: string;
        ok?: boolean;
        status?: number;
        text?: string;
        message?: string;
      };
      if (!data?.requestId) return;
      const entry = pending.get(data.requestId);
      if (!entry) return;
      pending.delete(data.requestId);
      if (data.ok === true && typeof data.text === "string") {
        entry.resolve({
          status: typeof data.status === "number" ? data.status : 0,
          text: data.text,
        });
        return;
      }
      entry.reject(new Error(data.message || "history_worker_failed"));
    });
    worker.addEventListener("error", () => {
      for (const [id, entry] of pending) {
        pending.delete(id);
        entry.reject(new Error("history_worker_error"));
      }
    });
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

export function historyFetchWorkerSupported(): boolean {
  return ensureHistoryFetchWorker() != null;
}

export function currentHistoryFetchWorker(): Worker | null {
  return worker;
}

/** Drop one dead worker. A newer worker started by another retry is left alone. */
export function resetHistoryFetchWorker(expected: Worker | null): void {
  if (expected == null || worker !== expected) return;
  worker = null;
  expected.terminate();
  for (const [id, entry] of pending) {
    pending.delete(id);
    entry.reject(new Error("history_worker_reset"));
  }
}

export function fetchHistoryBodyInWorker(
  url: string,
  timeoutMs = 45_000,
): Promise<WorkerResult> {
  const w = ensureHistoryFetchWorker();
  if (!w) return Promise.reject(new Error("history_worker_unavailable"));
  const requestId = `hsp-hist-${++nextRequestId}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.delete(requestId);
      reject(new Error("history_worker_timeout"));
    }, timeoutMs);
    pending.set(requestId, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
    w.postMessage({ requestId, url });
  });
}
