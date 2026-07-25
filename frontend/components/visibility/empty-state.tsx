import Link from 'next/link';
import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Empty state for a project with no completed runs (design.md §9.6). The
 * dashboard is a projection over completed audits, so there is nothing to
 * render until one finishes. When a run is already in progress
 * (`hasActiveRun`), the copy and CTA switch from "launch one" to "one is on
 * its way".
 *
 * Copy is one line each: the old version listed what the dashboard would
 * eventually show (score, per-engine comparison, rankings), which the screen
 * makes obvious the moment it has data.
 */
export function VisibilityEmptyState({
  hasActiveRun = false,
}: Readonly<{ hasActiveRun?: boolean }>) {
  return (
    <EmptyState
      icon={Rocket}
      heading="No completed runs yet"
      description={
        hasActiveRun
          ? 'An audit is running — results appear here when it finishes.'
          : 'Launch an audit to see how AI answer engines talk about your brand.'
      }
      action={
        <Button asChild variant={hasActiveRun ? 'secondary' : 'primary'} size="md">
          <Link href="/runs">{hasActiveRun ? 'View runs' : 'Launch your first audit'}</Link>
        </Button>
      }
    />
  );
}
