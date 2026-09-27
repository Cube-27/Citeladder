/**
 * The unified API error envelope (docs/api-error-contract.md).
 *
 * Mirrors `backend/app/core/errors.py`: every 4xx/5xx body is
 * `{detail, error: {code, message, request_id, retryable, details?}}`, with
 * `detail` retained for legacy clients. Codes and the retryable rule come
 * from the Python policy export, typed by the contracts' code union; the shared envelope is tested by shape.
 */
import { asApiErrorCode, type ApiErrorCode } from '@citeladder/contracts/error-codes';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { policy } from './config.ts';
import { getLogger } from './logging.ts';

const logger = getLogger('api.errors');

const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred';
// Narrowed at import, so a policy export naming an undeclared code fails at
// startup rather than on the first unhandled error.
const INTERNAL_ERROR_CODE = asApiErrorCode(policy.errors.internal_error_code);

export type Envelope = {
  detail: unknown;
  error: {
    code: ApiErrorCode;
    message: string;
    request_id: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
};

export function isRetryableStatus(status: number): boolean {
  return policy.errors.retryable_statuses.includes(status) || (status >= 500 && status <= 599);
}

/** The status's canonical code, or the fallback for an unmapped status. */
export function defaultCode(status: number): ApiErrorCode {
  const codes: Record<string, string> = policy.errors.status_default_code;
  return asApiErrorCode(codes[String(status)] ?? policy.errors.fallback_code);
}

export function errorEnvelope(input: {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
  details?: Record<string, unknown> | null;
  detail?: unknown;
}): Envelope {
  const error: Envelope['error'] = {
    code: input.code,
    message: input.message,
    request_id: input.requestId,
    retryable: input.retryable,
  };
  if (input.details != null) error.details = input.details;
  return { detail: input.detail ?? input.message, error };
}

/** What every route raises: the TS counterpart of `ApiException`. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, unknown>;
  readonly detail?: unknown;
  readonly retryable?: boolean;
  readonly headers?: Record<string, string>;

  constructor(
    status: ContentfulStatusCode,
    message: string,
    options: {
      code?: ApiErrorCode;
      details?: Record<string, unknown>;
      detail?: unknown;
      retryable?: boolean;
      headers?: Record<string, string>;
    } = {},
  ) {
    super(message);
    this.status = status;
    this.code = options.code ?? defaultCode(status);
    this.details = options.details;
    this.detail = options.detail;
    this.retryable = options.retryable;
    this.headers = options.headers;
  }

  isRetryable(): boolean {
    return this.retryable ?? isRetryableStatus(this.status);
  }
}

/** The repeated 404, detail exactly "{resource} not found". */
export function notFound(resource: string): ApiError {
  return new ApiError(404, `${resource} not found`);
}

function requestIdOf(c: Context): string {
  return (c.get('requestId') as string | undefined) ?? '';
}

function statusPhrase(response: Response): string {
  return response.statusText || 'Error';
}

export const onError: ErrorHandler = (error, c) => {
  const requestId = requestIdOf(c);
  if (error instanceof ApiError) {
    return c.json(
      errorEnvelope({
        code: error.code,
        message: error.message,
        requestId,
        retryable: error.isRetryable(),
        details: error.details,
        detail: error.detail,
      }),
      error.status,
      error.headers,
    );
  }
  if (error instanceof HTTPException) {
    // The framework's own failures (malformed input a middleware refused),
    // coded from the status exactly as the backend's shim handler does.
    const status = error.status as ContentfulStatusCode;
    const message = error.message || statusPhrase(error.getResponse());
    return c.json(
      errorEnvelope({
        code: defaultCode(status),
        message,
        requestId,
        retryable: isRetryableStatus(status),
      }),
      status,
    );
  }
  logger.exception('unhandled_api_exception', error, {
    method: c.req.method,
    path: c.req.path,
    request_id: requestId,
  });
  return c.json(
    errorEnvelope({
      code: INTERNAL_ERROR_CODE,
      message: INTERNAL_ERROR_MESSAGE,
      requestId,
      retryable: isRetryableStatus(500),
    }),
    500,
  );
};

/** Unknown path: the same body Starlette's routing 404 produces. */
export const onNotFound: NotFoundHandler = (c) =>
  c.json(
    errorEnvelope({
      code: defaultCode(404),
      message: 'Not Found',
      requestId: requestIdOf(c),
      retryable: false,
    }),
    404,
  );
