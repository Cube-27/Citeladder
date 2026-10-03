import { heartbeatFailureLimit } from '../config/execution.ts';

/** Serialize renewals; a definite loss or sustained failure stops further I/O. */
export function maintainLease(
  renew: () => Promise<boolean>,
  intervalMs: number,
  onError: (error: unknown) => void = () => undefined,
) {
  const abort = new AbortController();
  let failures = 0;
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (pending || abort.signal.aborted) return;
    pending = Promise.resolve()
      .then(renew)
      .then((live) => {
        failures = 0;
        if (!live) abort.abort();
      })
      .catch((error: unknown) => {
        failures++;
        if (failures >= heartbeatFailureLimit) abort.abort();
        onError(error);
      })
      .finally(() => {
        pending = undefined;
      });
  }, intervalMs);
  return {
    signal: abort.signal,
    async stop() {
      clearInterval(timer);
      await pending;
    },
  };
}
