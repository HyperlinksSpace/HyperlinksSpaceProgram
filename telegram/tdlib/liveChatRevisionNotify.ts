type RevisionListener = (revision: number) => void;

const listenersByUser = new Map<string, Set<RevisionListener>>();
const pendingRevisionByUser = new Map<string, number>();
const emitTimerByUser = new Map<string, ReturnType<typeof setTimeout>>();

const EMIT_DEBOUNCE_MS = 400;

function flushPendingRevision(telegramUsername: string): void {
  emitTimerByUser.delete(telegramUsername);
  const revision = pendingRevisionByUser.get(telegramUsername);
  pendingRevisionByUser.delete(telegramUsername);
  if (revision == null) return;

  const set = listenersByUser.get(telegramUsername);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(revision);
    } catch {
      /* subscriber error must not break cache updates */
    }
  }
}

export function onLiveChatRevision(telegramUsername: string, listener: RevisionListener): () => void {
  let set = listenersByUser.get(telegramUsername);
  if (!set) {
    set = new Set();
    listenersByUser.set(telegramUsername, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) {
      listenersByUser.delete(telegramUsername);
    }
  };
}

/** Coalesce rapid cache bumps (presence, typing, etc.) into one SSE revision event. */
export function emitLiveChatRevision(telegramUsername: string, revision: number): void {
  pendingRevisionByUser.set(telegramUsername, revision);
  if (emitTimerByUser.has(telegramUsername)) return;

  const timer = setTimeout(() => {
    flushPendingRevision(telegramUsername);
  }, EMIT_DEBOUNCE_MS);
  emitTimerByUser.set(telegramUsername, timer);
}
