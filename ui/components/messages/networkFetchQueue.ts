const MAX_CONCURRENT = 4;
let inFlight = 0;
const waiters: Array<() => void> = [];

/** Limit parallel browser fetches so chat lists do not exhaust connection pools. */
export function runQueuedNetworkFetch<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      inFlight += 1;
      void fn()
        .then(resolve, reject)
        .finally(() => {
          inFlight -= 1;
          const next = waiters.shift();
          if (next) next();
        });
    };
    if (inFlight < MAX_CONCURRENT) run();
    else waiters.push(run);
  });
}
