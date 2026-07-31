/**
 * Shared mutation-notice policy (A4).
 *
 * ONE owner (invariant 2) for how a failed mutation reads in the UI:
 *   - **4xx (precondition/validation, not 408/429)** → the backend `message`
 *     verbatim. It names a real precondition ("no completed sync window is
 *     available"), so NO "try again" copy is appended — retrying unchanged
 *     would fail the same way.
 *   - **5xx / network / timeout** → generic transient copy WITH a retry
 *     affordance (`retryable: true`, so the notice can offer one).
 *   - The backend's explicit `retryable` classification (A1 envelope) and the
 *     A3 `request_timeout` surface always win over the status heuristic.
 *   - `code` and `requestId` ride along for support correlation (A6).
 *
 * Display lives in `components/ui/mutation-notice.tsx`; this module is the
 * pure, testable policy.
 */
import { humanizeApiError, httpErrorStatus } from './errors';

export type MutationNotice = {
  /** User-facing copy (verbatim backend message on 4xx, transient copy otherwise). */
  message: string;
  /** True when retrying the same action can succeed — the retry affordance. */
  retryable: boolean;
  /** Stable machine code for support correlation, when the backend sent one. */
  code?: string;
  /** `X-Request-ID` correlation token, when captured. */
  requestId?: string;
};

/** True when the failure class is transient (retrying can succeed). */
export function isTransientMutationError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'retryable' in error) {
    const retryable = (error as { retryable: unknown }).retryable;
    if (typeof retryable === 'boolean') return retryable;
  }
  const status = httpErrorStatus(error);
  // No status = network-class failure (offline, DNS, the A3 timeout ApiError).
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Build the notice for a failed mutation. `action` is the verb phrase that
 * completes "Could not ___" (e.g. `'start the attribution recompute'`) and is
 * used only for transient failures — 4xx copy is the backend's own message.
 */
export function mutationNoticeForError(
  error: unknown,
  options: { action: string },
): MutationNotice {
  const humanized = humanizeApiError(error);
  const retryable = isTransientMutationError(error);
  return {
    message: retryable
      ? `Could not ${options.action} — the request failed or timed out. This is usually temporary; try again.`
      : humanized.message,
    retryable,
    code: humanized.code,
    requestId: humanized.requestId,
  };
}
