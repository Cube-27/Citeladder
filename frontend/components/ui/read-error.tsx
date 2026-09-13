import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { humanizeApiError } from '@/lib/api/errors';

/**
 * Scoped recovery for a failed persisted read.
 *
 * The owner chooses which exact read to retry; this presentation component
 * intentionally has no query-key or network knowledge.
 */
export function ReadError({
  error,
  fallback,
  onRetry,
  pending = false,
  className,
}: Readonly<{
  error: unknown;
  fallback: string;
  onRetry: () => void;
  pending?: boolean;
  className?: string;
}>) {
  const detail = humanizeApiError(error, fallback);
  const accessFailure = detail.status === 401 || detail.status === 403;
  const retryable = detail.retryable !== false && !accessFailure;
  return (
    <Alert tone="danger" className={className}>
      <div className="grid gap-3">
        <p>{detail.message}</p>
        {retryable ? (
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={onRetry}
            pending={pending}
            pendingLabel="Retrying…"
          >
            Retry
          </Button>
        ) : accessFailure ? (
          <p className="text-xs">Check your workspace access, then try again.</p>
        ) : null}
        {detail.requestId ? (
          <p className="text-muted text-xs">Reference: {detail.requestId}</p>
        ) : null}
      </div>
    </Alert>
  );
}
