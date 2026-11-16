import { useEffect, useState, type ReactNode } from 'react';

import { LOADING_INDICATOR_DELAY_MS } from '@/lib/config/operational';
import { cn } from '@/lib/utils';

/**
 * The parts every loading shape is made of, kept apart from `Skeleton`'s
 * variants so the shell's loading state does not carry them on boot.
 */

/** One placeholder: a `well` block, radius 4, at least 12 high. */
export function SkeletonBlock({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden
      data-skeleton-block=""
      className={cn('skeleton-block bg-well block h-3 min-h-3 rounded-sm', className)}
    />
  );
}

/** Unequal widths, so a text block does not read as a ruled form. */
export const TEXT_WIDTHS = ['w-full', 'w-4/5', 'w-3/5'] as const;

/** The shapes a read's loading state takes: the shape of the page part it stands for. */
export type LoadingShape =
  | Readonly<{ kind: 'card'; lines?: number }>
  | Readonly<{ kind: 'table'; columns?: number }>
  | Readonly<{ kind: 'figures'; count?: number }>
  | Readonly<{ kind: 'chart'; height?: ChartHeight }>
  | Readonly<{ kind: 'thread' }>;

export type ChartHeight = 'sm' | 'md' | 'lg';

const CHART_HEIGHT: Record<ChartHeight, string> = {
  sm: 'h-[var(--chart-height-sm)]',
  md: 'h-[var(--chart-height-md)]',
  lg: 'h-[var(--chart-height-lg)]',
};

/** A loading shape's blocks, without a frame of its own. */
export function ShapeBlocks({ shape }: Readonly<{ shape: LoadingShape }>) {
  switch (shape.kind) {
    case 'card':
      return <CardBlocks lines={shape.lines} />;
    case 'table':
      return <TableBlocks columns={shape.columns} />;
    case 'figures':
      return <FigureBlocks count={shape.count} />;
    case 'chart':
      return <SkeletonBlock className={cn('w-full', CHART_HEIGHT[shape.height ?? 'md'])} />;
    case 'thread':
      return <ThreadBlocks />;
    default: {
      const exhaustive: never = shape;
      return exhaustive;
    }
  }
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** A card body: a title block (16×160), then text blocks at 100/80/60%, 12 apart. */
export function CardBlocks({ lines = 3 }: Readonly<{ lines?: number }>) {
  return (
    <span className="grid gap-3">
      <SkeletonBlock className="h-4 w-40 max-w-full" />
      {range(lines).map((index) => (
        <SkeletonBlock key={index} className={TEXT_WIDTHS[index % TEXT_WIDTHS.length]} />
      ))}
    </span>
  );
}

/** Cell block widths for a four-column table; more columns share the rest. */
const CELL_WIDTHS = ['w-2/5', 'w-1/5', 'w-[15%]', 'w-[15%]'] as const;

function cellWidth(columns: number, cell: number): string {
  if (columns === CELL_WIDTHS.length) return CELL_WIDTHS[cell] ?? 'flex-1';
  return cell === 0 ? 'w-2/5' : 'flex-1';
}

/** A table: a head row on `well` at the table head's height, then 40px rows of cell blocks. */
export function TableBlocks({
  columns = 4,
  rows = 5,
  head = true,
}: Readonly<{ columns?: number; rows?: number; head?: boolean }>) {
  const cells = range(Math.max(1, columns));
  const width = (cell: number) => cellWidth(columns, cell);
  return (
    <span className="grid">
      {head ? <span className="bg-well block h-[var(--table-header-height)] rounded-sm" /> : null}
      {range(rows).map((row) => (
        <span key={row} className="flex h-10 items-center gap-4 px-4">
          {cells.map((cell) => (
            <SkeletonBlock key={cell} className={width(cell)} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** Metric cards: a label block (14×96) over a value block (24×64) in each frame. */
export function FigureBlocks({ count = 3 }: Readonly<{ count?: number }>) {
  return (
    <span className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
      {range(count).map((index) => (
        <span
          key={index}
          className="bg-surface border-rule rounded-card shadow-card grid gap-2 border p-4"
        >
          <SkeletonBlock className="h-3.5 min-h-3.5 w-24" />
          <SkeletonBlock className="h-6 w-16" />
        </span>
      ))}
    </span>
  );
}

/** A chat: user turns (right, 60%, 48 high) alternating with replies (left, 80%, 72 high), 24 apart. */
function ThreadBlocks() {
  // Own spans: cn() does not merge the named radii over SkeletonBlock's rounded-sm.
  return (
    <span className="grid gap-[var(--page-top-gap)]">
      {range(3).map((index) => (
        <span
          key={index}
          aria-hidden
          data-skeleton-block=""
          className={cn(
            'skeleton-block bg-well block',
            index % 2 === 0 ? 'rounded-card ms-auto h-12 w-3/5' : 'rounded-control min-h-18 w-4/5',
          )}
        />
      ))}
    </span>
  );
}

/** A loading shape's frame: busy, with only its verb announced, after a beat. */
export function SkeletonFrame({
  label,
  variant,
  className,
  children,
}: Readonly<{ label: string; variant: string; className?: string; children: ReactNode }>) {
  return (
    <div aria-busy="true" data-skeleton={variant} className={cn('min-w-0', className)}>
      <LiveVerb label={label} />
      {children}
    </div>
  );
}

/**
 * Loaders on screen that have already been revealed. A cold load passes
 * through several owners in turn (shell, route chunk, first read); a loader
 * that mounts while another is showing is the same wait, so it starts revealed.
 */
let revealedLoaders = 0;

/**
 * What is loading ("Loading runs"), announced after a beat
 * (`LOADING_INDICATOR_DELAY_MS`) and never drawn: the blocks show that it loads.
 */
export function LiveVerb({ label }: Readonly<{ label: string }>) {
  const [revealed, setRevealed] = useState(() => revealedLoaders > 0);
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
  return revealed ? <output aria-label={label} className="sr-only" /> : null;
}
