'use client';

import { CircleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Route-level error boundary for the authed area.
 *
 * Renders inside the AppShell content column (the layout — and with it the
 * sidebar, top bar, and page header — stays mounted), on the shared
 * EmptyState pattern so a crashed screen still looks like the rest of the
 * app in both themes instead of the unthemed Next.js default. `reset()`
 * re-renders the failed segment. There is deliberately no `loading.tsx`
 * sibling: per-component `skeleton.tsx` already covers route loading.
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

  return (
    <EmptyState
      icon={CircleAlert}
      heading="Something went wrong"
      description="This screen hit an unexpected error — retrying usually fixes it."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
