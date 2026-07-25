'use client';

import { AlertTriangle, Check, Globe, Loader2, MessageSquare, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DiscoveryState, SectionStatus } from '@/lib/onboarding/use-discovery';

/**
 * The discovery step's on-screen progress.
 *
 * Three rows, one per parallel call, each resolving independently — the point
 * of the animation is to make "we are doing three things for you" legible while
 * the calls are in flight, and to let a single failure sit next to two
 * successes instead of replacing them.
 *
 * Motion is a spinner and a colour/opacity change only. No layout animates, so
 * rows do not jump as they land, and `motion-reduce` drops the spin — the icon
 * still changes shape on completion, so state is never conveyed by motion alone
 * (nor by colour alone: each row has an icon and a text status).
 */
const ROWS = [
  { key: 'domains', icon: Globe, label: 'Your domains' },
  { key: 'competitors', icon: Users, label: 'Competitors' },
  { key: 'prompts', icon: MessageSquare, label: 'Starting prompts' },
] as const;

function statusText(status: SectionStatus, count: number, unconfigured: boolean) {
  if (status === 'error') return unconfigured ? 'Not available' : 'Failed';
  if (status === 'done') return count === 0 ? 'Nothing found' : `${count} found`;
  return 'Searching…';
}

export function DiscoveryProgress({
  state,
  onRetry,
}: Readonly<{
  state: DiscoveryState;
  onRetry: (key: 'domains' | 'competitors' | 'prompts') => void;
}>) {
  return (
    <ul className="grid list-none gap-2 p-0">
      {ROWS.map((row) => {
        const section = state[row.key];
        const count = section.data.length;
        const done = section.status === 'done';
        const failed = section.status === 'error';

        return (
          <li
            key={row.key}
            className="border-border bg-panel flex items-center gap-3 rounded-lg border px-3 py-2.5"
          >
            <row.icon
              className={cn('size-4 shrink-0', done ? 'text-foreground' : 'text-muted')}
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="text-foreground min-w-0 flex-1 truncate text-sm">{row.label}</span>

            <span
              className={cn(
                'text-xs',
                failed ? 'text-danger-text' : done ? 'text-secondary' : 'text-muted',
              )}
              // The row's status is announced as one string rather than as a
              // spinner the screen reader would narrate as a graphic.
              role="status"
            >
              {statusText(section.status, count, section.unconfigured)}
            </span>

            {failed ? (
              <AlertTriangle className="text-danger-text size-4 shrink-0" aria-hidden />
            ) : done ? (
              <Check className="text-success size-4 shrink-0" aria-hidden />
            ) : (
              <Loader2
                className="text-muted size-4 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            )}

            {failed && !section.unconfigured ? (
              <Button variant="ghost" size="sm" onClick={() => onRetry(row.key)}>
                Retry
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
