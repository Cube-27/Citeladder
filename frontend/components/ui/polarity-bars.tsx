import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Polarity = 'negative' | 'positive';

const DOT: Record<Polarity, string> = { negative: 'bg-negative', positive: 'bg-positive' };

type RankBar = Readonly<{ key: string; label: string; value: ReactNode; percent: number }>;

export function RankBarList({
  rows,
  polarity,
}: Readonly<{ rows: readonly RankBar[]; polarity: Polarity }>) {
  return (
    <ol className="grid gap-1">
      {rows.map((row) => (
        <li key={row.key} className="grid h-8 grid-cols-[minmax(0,1fr)_56px] items-center gap-3">
          <span className="min-w-0">
            <span
              className="bg-raised-2 rounded-mark flex h-7 w-(--fill) min-w-max items-center gap-2 px-2.5"
              style={{ '--fill': `${row.percent}%` }}
            >
              <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[polarity])} />
              <span className="text-body text-ink whitespace-nowrap">{row.label}</span>
            </span>
          </span>
          <span className="text-body text-ink text-right tabular-nums">{row.value}</span>
        </li>
      ))}
    </ol>
  );
}

export function PolaritySplit({
  negative,
  positive,
}: Readonly<{ negative: number; positive: number }>) {
  const total = negative + positive;
  if (!total) return null;
  return (
    <span aria-hidden className="flex h-1.5 w-40 gap-0.5">
      {negative ? (
        <span
          className="bg-negative w-(--fill) rounded-full"
          style={{ '--fill': `${(negative / total) * 100}%` }}
        />
      ) : null}
      {positive ? (
        <span
          className="bg-positive w-(--fill) rounded-full"
          style={{ '--fill': `${(positive / total) * 100}%` }}
        />
      ) : null}
    </span>
  );
}
