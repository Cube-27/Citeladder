import { useEffect, useState } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { LOADING_INDICATOR_DELAY_MS } from '@/lib/config/operational';
import { cn } from '@/lib/utils';

type SkeletonProps = Readonly<{
  /** What is loading, as a verb: "Loading runs". */
  label?: string;
  className?: string;
}> &
  (
    | Readonly<{ variant?: 'text'; lines?: 1 | 2 | 3 }>
    | Readonly<{ variant: 'table'; columns: number; rows?: number; head?: boolean }>
    | Readonly<{ variant: 'stat'; count?: number }>
    | Readonly<{ variant: 'form'; fields?: number }>
    | Readonly<{ variant: 'block'; rows?: number }>
    | Readonly<{ variant: 'chart'; height?: ChartHeight }>
  );

type ChartHeight = 'sm' | 'md' | 'lg';

const CHART_HEIGHT: Record<ChartHeight, string> = {
  sm: 'h-[var(--chart-height-sm)]',
  md: 'h-[var(--chart-height-md)]',
  lg: 'h-[var(--chart-height-lg)]',
};

/**
 * Skeleton — the shape of what is loading, made of `well` blocks (radius 6)
 * on the real card: never lines. Each variant is shaped like what it stands
 * for, at its final size, so content arriving moves nothing by more than 8px.
 * A soft shimmer crosses the blocks; under reduced motion they are still.
 *
 *   `text`  — two or three blocks of unequal width.
 *   `table` — the real column count: a head row (36) and `rows` rows (40).
 *   `stat`  — `count` stat cards: a label block over a value block.
 *   `form`  — `fields` label and field blocks.
 *   `block` — a card body of `rows` list rows: a title block over a caption block.
 *   `chart` — one block at the chart's height.
 *
 * The blocks are drawing, not content: only the verb is announced, after a beat.
 */
export function Skeleton(props: SkeletonProps) {
  const { label = 'Loading', className } = props;
  return (
    <div
      aria-busy="true"
      data-skeleton={props.variant ?? 'text'}
      className={cn('min-w-0', className)}
    >
      <LiveVerb label={label} hidden />
      <SkeletonBody {...props} />
    </div>
  );
}

/** One placeholder: a `well` block, at least 12 high. */
export function SkeletonBlock({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden
      data-skeleton-block=""
      className={cn('skeleton-block bg-well rounded-control block h-3 min-h-3', className)}
    />
  );
}

/** Unequal widths, so a text block does not read as a ruled form. */
const TEXT_WIDTHS = ['w-11/12', 'w-3/4', 'w-1/2'] as const;

function SkeletonBody(props: SkeletonProps) {
  switch (props.variant) {
    case 'table':
      return <TableBlocks columns={props.columns} rows={props.rows} head={props.head} />;
    case 'stat':
      return <StatBlocks count={props.count} />;
    case 'form':
      return <FormBlocks fields={props.fields} />;
    case 'block':
      return <RowBlocks rows={props.rows} />;
    case 'chart':
      return <SkeletonBlock className={cn('w-full', CHART_HEIGHT[props.height ?? 'md'])} />;
    case 'text':
    case undefined:
      return <TextBlocks lines={props.lines} />;
    default: {
      const exhaustive: never = props;
      return exhaustive;
    }
  }
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

function TextBlocks({ lines = 3 }: Readonly<{ lines?: 1 | 2 | 3 }>) {
  return (
    <span className="grid gap-2">
      {TEXT_WIDTHS.slice(0, lines).map((width) => (
        <SkeletonBlock key={width} className={cn('h-4', width)} />
      ))}
    </span>
  );
}

function StatBlocks({ count = 4 }: Readonly<{ count?: number }>) {
  return (
    <span className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
      {range(count).map((index) => (
        <span
          key={index}
          className="bg-surface border-rule rounded-card shadow-card grid gap-2 border p-4"
        >
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-6 w-2/3" />
        </span>
      ))}
    </span>
  );
}

function FormBlocks({ fields = 3 }: Readonly<{ fields?: number }>) {
  return (
    <span className="grid gap-4">
      {range(fields).map((index) => (
        <span key={index} className="grid max-w-160 gap-1">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-[var(--control-md)] w-full" />
        </span>
      ))}
    </span>
  );
}

/** A card body of list rows: a title block over a caption block, 56 apart. */
function RowBlocks({ rows = 4 }: Readonly<{ rows?: number }>) {
  return (
    <span className="grid">
      {range(rows).map((index) => (
        <span key={index} className="grid h-14 content-center gap-2">
          <SkeletonBlock className={cn('h-4', TEXT_WIDTHS[index % 2])} />
          <SkeletonBlock className="h-3 w-1/3" />
        </span>
      ))}
    </span>
  );
}

/** A table's loading shape outside a DataTable: its head row and rows of cell blocks. */
function TableBlocks({
  columns,
  rows = 5,
  head = true,
}: Readonly<{ columns: number; rows?: number; head?: boolean }>) {
  const cells = range(Math.max(1, columns));
  return (
    <span className="grid">
      {head ? (
        <span className="bg-well flex h-[var(--table-header-height)] items-center gap-4 px-4">
          {cells.map((cell) => (
            <span key={cell} className="flex-1" />
          ))}
        </span>
      ) : null}
      {range(rows).map((row) => (
        <span key={row} className="flex h-10 items-center gap-4 px-4">
          {cells.map((cell) => (
            <SkeletonBlock key={cell} className={cn('flex-1', cell === 0 && 'flex-[2]')} />
          ))}
        </span>
      ))}
    </span>
  );
}

/**
 * Loaders on screen that have already been revealed. A cold load passes
 * through several owners in turn (shell, route chunk, first read); a loader
 * that mounts while another is showing is the same wait, so it starts revealed.
 */
let revealedLoaders = 0;

/**
 * The live rung and its verb ("Loading runs"), held back a beat
 * (`loading-delayed`). `hidden` announces the verb without drawing it, for a
 * skeleton whose blocks already show that something loads.
 */
export function LiveVerb({ label, hidden = false }: Readonly<{ label: string; hidden?: boolean }>) {
  const [continued] = useState(() => revealedLoaders > 0);
  const [revealed, setRevealed] = useState(continued);
  useEffect(() => {
    if (!revealed) {
      const timer = setTimeout(() => setRevealed(true), LOADING_INDICATOR_DELAY_MS);
      return () => clearTimeout(timer);
    }
    revealedLoaders += 1;
    return () => {
      revealedLoaders -= 1;
    };
  }, [revealed]);
  if (hidden) return revealed ? <output aria-label={label} className="sr-only" /> : null;
  return (
    <span className={cn('flex min-h-5 items-center', continued ? undefined : 'loading-delayed')}>
      {revealed ? (
        <output aria-label={label} className="inline-flex items-center gap-2">
          <Spinner />
          <span aria-hidden className={textRole('body', 'text-ink-2')}>
            {label}
          </span>
        </output>
      ) : null}
    </span>
  );
}
