import { logPageDisplay } from "../pageDisplayLog";
import { abandonTmaHistoryBodyFlights } from "./iosForegroundHistoryHttp";

/** Chat-list GETs, warmup, neighbor preview — safe to drop on compact open tap. */
const listCompetingReads = new Set<AbortController>();

/** Open-chat history body — must not be aborted by list tap or a second open join. */
const historyOpenReads = new Set<AbortController>();

/** A profile, warmup, or chat-list body that can be dropped when iOS opens a chat. */
export function openIosCompetingRead(): {
  signal: AbortSignal;
  finish: () => void;
  abort: () => void;
} {
  const controller = new AbortController();
  listCompetingReads.add(controller);
  return {
    signal: controller.signal,
    finish: () => {
      listCompetingReads.delete(controller);
    },
    abort: () => controller.abort(),
  };
}

/** Foreground open history on iOS TMA — separate from {@link abortIosCompetingReads}. */
export function openIosHistoryOpenRead(): {
  signal: AbortSignal;
  finish: () => void;
  abort: () => void;
} {
  if (historyOpenReads.size > 0) {
    logPageDisplay("messages_history_open_read_join", {
      count: historyOpenReads.size,
    });
  }
  const controller = new AbortController();
  historyOpenReads.add(controller);
  return {
    signal: controller.signal,
    finish: () => {
      historyOpenReads.delete(controller);
    },
    abort: () => controller.abort(),
  };
}

/** Drop list/warmup bodies before open history. Call only from the list tap — not mid-history. */
export function abortIosCompetingReads(reason?: string): void {
  const count = listCompetingReads.size;
  if (count > 0) {
    logPageDisplay("messages_ios_competing_abort", {
      count,
      reason: reason ?? "unspecified",
      lane: "list",
    });
  }
  for (const controller of listCompetingReads) controller.abort();
  listCompetingReads.clear();
}

export function abortIosHistoryOpenReads(reason?: string): void {
  abandonTmaHistoryBodyFlights(reason ?? "history_open_abort");
  const count = historyOpenReads.size;
  if (count > 0) {
    logPageDisplay("messages_ios_competing_abort", {
      count,
      reason: reason ?? "unspecified",
      lane: "history_open",
    });
  }
  for (const controller of historyOpenReads) controller.abort();
  historyOpenReads.clear();
}