const competingReads = new Set<AbortController>();

/** A profile, warmup, or chat-list body that can be dropped when iOS opens a chat. */
export function openIosCompetingRead(): {
  signal: AbortSignal;
  finish: () => void;
  abort: () => void;
} {
  const controller = new AbortController();
  competingReads.add(controller);
  return {
    signal: controller.signal,
    finish: () => {
      competingReads.delete(controller);
    },
    abort: () => controller.abort(),
  };
}

/** Drop in-flight bodies so the history read is the only one the WebView has to deliver. */
export function abortIosCompetingReads(): void {
  for (const controller of competingReads) controller.abort();
  competingReads.clear();
}
