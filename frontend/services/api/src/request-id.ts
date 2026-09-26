/**
 * Correlation ids, byte-compatible with the backend's correlation middleware.
 *
 * A safe client-supplied id is kept, anything else is replaced by a fresh
 * 16-hex-character id, and the id is echoed in the configured response header
 * and bound to every log record written while the request runs.
 */
import { randomUUID } from 'node:crypto';

import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from './context.ts';
import { withCorrelationId } from './logging.ts';

const MAX_LENGTH = 128;
// Python's `str.strip()` whitespace set; JavaScript's `trim()` differs on
// U+001C-U+001F, U+0085 and U+FEFF.
const PYTHON_WHITESPACE =
  '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const EDGE_WHITESPACE = new RegExp(`^[${PYTHON_WHITESPACE}]+|[${PYTHON_WHITESPACE}]+$`, 'gu');
// Python's `str.isalnum()` (letters and numbers in any script) plus `-_.`.
const SAFE_ID = /^[\p{L}\p{N}\-_.]+$/u;

/** Mirror of `app.core.telemetry.sanitize_correlation_id`. */
export function sanitizeCorrelationId(value: string): string {
  const candidate = value.replaceAll(EDGE_WHITESPACE, '');
  const length = [...candidate].length;
  return length > 0 && length <= MAX_LENGTH && SAFE_ID.test(candidate) ? candidate : '';
}

function generateCorrelationId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 16);
}

export function requestId(headerName: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = sanitizeCorrelationId(c.req.header(headerName) ?? '') || generateCorrelationId();
    c.set('requestId', id);
    await withCorrelationId(id, next);
    c.header(headerName, id);
  };
}
