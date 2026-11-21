import { ApiError, humanizeApiError, httpErrorStatus } from './errors';

export type MutationNotice = {
  message: string;
  retryable: boolean;
  code?: string;
  requestId?: string;
};

export function isTransientMutationError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'retryable' in error) {
    if (typeof error.retryable === 'boolean') return error.retryable;
  }
  const status = httpErrorStatus(error);
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
}

export function mutationNoticeForError(
  error: unknown,
  options: { action: string },
): MutationNotice {
  const humanized = humanizeApiError(error);
  const retryable = isTransientMutationError(error);
  return {
    message: retryable ? transientMessage(error, options.action) : humanized.message,
    retryable,
    code: humanized.code,
    requestId: humanized.requestId,
  };
}

const _GENERIC_TRANSIENT_CODES = new Set(['internal_error', 'request_timeout', 'http_error']);

function transientMessage(error: unknown, action: string): string {
  const generic = `Could not ${action}. The request failed or timed out. This is usually temporary; try again.`;
  return serverMessage(error) ?? generic;
}

export function serverMessage(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (error.status <= 0 || !error.code || _GENERIC_TRANSIENT_CODES.has(error.code))
    return undefined;
  return error.message.trim() || undefined;
}
