/**
 * API error types + helpers (F2).
 *
 * `ApiError` is thrown by the transport (`client.ts`) for any non-2xx response
 * or a JSON-contract violation. It carries the HTTP status, the raw response
 * body, the correlating `X-Request-ID`, and — when the backend sent the
 * canonical error envelope (A1) — the stable machine `code` and the
 * server-classified `retryable` flag. `httpErrorStatus` / `isAbortError` are
 * shared by the retry policy in `query-client.ts` and the client's bounded
 * network retry. `humanizeApiError` is the ONE owner of error-to-copy
 * conversion for components (invariant 2) — components never re-derive
 * messages from `error.body`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly requestId?: string;
  /** Stable snake_case machine code from the error envelope, when sent. */
  readonly code?: string;
  /** Server-side retryability classification, when sent (A1 envelope). */
  readonly retryable?: boolean;

  constructor(
    message: string,
    status: number,
    body: string,
    requestId?: string,
    options?: { code?: string; retryable?: boolean },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.requestId = requestId;
    this.code = options?.code;
    this.retryable = options?.retryable;
  }
}

/** The human-facing projection of any caught error (component boundary). */
export type HumanizedApiError = {
  /** Human-readable message — never a raw JSON blob. */
  message: string;
  /** HTTP status when the error carried one (0/absent for network failures). */
  status?: number;
  /** Stable machine code for support correlation, when sent. */
  code?: string;
  /** Server retryability classification, when sent. */
  retryable?: boolean;
  /** `X-Request-ID` correlation token, when captured. */
  requestId?: string;
};

/**
 * Project any caught error into display-safe copy. `ApiError` messages are
 * already humanized by the transport (`readErrorBody`); anything else falls
 * back to its `Error.message`, then to `fallbackMessage`. Never returns a raw
 * JSON blob or an empty string.
 */
export function humanizeApiError(
  error: unknown,
  fallbackMessage = 'Something went wrong. Please try again.',
): HumanizedApiError {
  if (error instanceof ApiError) {
    return {
      message: error.message.trim() || fallbackMessage,
      status: error.status > 0 ? error.status : undefined,
      code: error.code,
      retryable: error.retryable,
      requestId: error.requestId,
    };
  }
  if (error instanceof Error && error.message.trim()) {
    return { message: error.message };
  }
  return { message: fallbackMessage };
}

/** Extract an HTTP status from an ApiError or a duck-typed `{ status }` error. */
export function httpErrorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status > 0 ? error.status : undefined;
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' && Number.isFinite(status) && status > 0 ? status : undefined;
  }
  return undefined;
}

/** True when the error originates from an aborted `AbortSignal`. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

/**
 * True when the error is an `AbortSignal.timeout()` expiry (a `TimeoutError`
 * DOMException). Kept distinct from `isAbortError`: a user/query abort must
 * never retry, while a timeout is a transient network-class failure.
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'TimeoutError'
    : error instanceof Error && error.name === 'TimeoutError';
}
