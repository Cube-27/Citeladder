import type { ReactNode } from 'react';

import { Value } from '@/components/ui/value';
import { cn } from '@/lib/utils';
import { slipClasses } from '@/components/ui/slip';

/**
 * A Stat: the mono eyebrow label, the value at 500, 24/32, then the change
 * line (a `Delta`). Stats are separated by 32px of space, never by rules. A
 * value always takes the foreground ink: colour means a state, so it goes on
 * the delta beside a figure, never on the figure itself.
 */
type StatSegment = Readonly<{
  key: string;
  label: string;
  value: string;
  delta?: ReactNode;
}>;

const DESKTOP_COLUMNS = {
  1: 'desktop:grid-cols-1',
  2: 'desktop:grid-cols-2',
  3: 'desktop:grid-cols-3',
  4: 'desktop:grid-cols-4',
  5: 'desktop:grid-cols-5',
  6: 'desktop:grid-cols-6',
} as const;

type Columns = keyof typeof DESKTOP_COLUMNS;

/**
 * KpiRow — the row of numbers that opens a report page: one Card holding the
 * Stats as a single strip, one row from the desktop breakpoint for up to six
 * (never 2 × 2 or 2 + 1), stacked below: 32 between columns, 24 between rows.
 */
export function KpiRow({ segments }: Readonly<{ segments: readonly StatSegment[] }>) {
  const columns = Math.max(1, Math.min(6, segments.length)) as Columns;
  return (
    <div className={slipClasses()}>
      <dl
        data-kpi-row=""
        className={cn('grid min-w-0 grid-cols-1 gap-x-8 gap-y-6', DESKTOP_COLUMNS[columns])}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            data-stat-segment=""
            className="rounded-control -m-3 grid min-w-0 content-start gap-x-4 gap-y-1 p-3"
          >
            {/* A label wraps to a second line rather than cutting a metric's name. */}
            <dt className="type-screen-label flex min-w-0 items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="line-clamp-2 min-w-0">{segment.label}</span>
              </span>
            </dt>
            <dd className="grid min-w-0 gap-1">
              <Value
                text="figure"
                value={segment.value}
                className="min-w-0 [overflow-wrap:anywhere]"
              />
            </dd>
            {segment.delta ? <dd className="min-w-0">{segment.delta}</dd> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
