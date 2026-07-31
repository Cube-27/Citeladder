'use client';

import { CircleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ApiError } from '@/lib/api/errors';

/**
 * Route-level error boundary for the authed area.
 *
 * Renders inside the AppShell content column (the layout — and with it the
 * sidebar, top bar, and page header — stays mounted), on the shared
 * EmptyState pattern so a crashed screen still looks like the rest of the
 * app in both themes instead of the unthemed Next.js default. `reset()`
 * re-renders the failed segment. There is deliberately no `loading.tsx`
 * sibling: per-component `skeleton.tsx` already covers route loading.
 *
 * Support correlation (A6): when the crash carries an `ApiError` request id
 * (`X-Request-ID`) / machine code, or a Next.js error `digest`, the reference
 * renders below the action so a user report maps straight to backend logs.
 */
export default function AppError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const correlation = [
    error instanceof ApiError && error.code ? `code ${error.code}` : null,
    error instanceof ApiError && error.requestId ? `ref ${error.requestId}` : null,
    !(error instanceof ApiError) && error.digest ? `digest ${error.digest}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <EmptyState
      icon={CircleAlert}
      heading="Something went wrong"
      description="This screen hit an unexpected error — retrying usually fixes it."
      action={<Button onClick={reset}>Try again</Button>}
      footnote={correlation ? <>Support: {correlation}</> : undefined}
    />
  );
}
