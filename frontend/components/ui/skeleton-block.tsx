import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import type { ChartHeight } from '@/components/ui/chart';
import { figureRowCells, useStripWidth } from '@/components/ui/figure-rows';
import { LOADING_INDICATOR_DELAY_MS } from '@/lib/config/operational';
import { cn } from '@/lib/utils';

/**
 * The parts every loading shape is made of, kept apart from `Skeleton`'s
 * variants so the shell's loading state does not carry them on boot.
 */

/**
 * One placeholder: a `well` block, radius 4, at least 12 high. Inside a
 * shape one sweep crosses every block (`skeleton-sweep`, ui-motion.css).
 */
export function SkeletonBlock({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden
      data-skeleton-block=""
      className={cn('skeleton-sweep bg-well block h-3 min-h-3 rounded-sm', className)}
    />
  );
}

/** Unequal widths, so a text block does not read as a ruled form. */
export const TEXT_WIDTHS = ['w-full', 'w-4/5', 'w-3/5'] as const;

/**
 * The shapes a read's loading state takes: the shape of the page part it
 * stands for, never a stack of text lines. A table's `desktopOnly` columns
 * (its last ones) leave below the `desktop` width, as the loaded table's do;
 * `tagRows` are the fact rows that show a tag; a `keyed` chart draws its key
 * above the plot and its event key and caption under it, as a line chart over
 * time does.
 */
export type LoadingShape =
  | Readonly<{ kind: 'table'; columns?: number; desktopOnly?: number }>
  | Readonly<{ kind: 'figures'; count?: number }>
  | Readonly<{ kind: 'chart'; height?: ChartHeight; keyed?: boolean }>
  | Readonly<{ kind: 'facts'; rows?: number; tagRows?: readonly number[] }>
  | Readonly<{ kind: 'list'; rows?: number }>
  | Readonly<{ kind: 'thread' }>;

const CHART_HEIGHT: Record<ChartHeight, string> = {
  sm: 'h-[var(--chart-height-sm)]',
  md: 'h-[var(--chart-height-md)]',
  lg: 'h-[var(--chart-height-lg)]',
};

/** A loading shape's blocks under one sweep, without a frame of its own. */
export function ShapeBlocks({ shape }: Readonly<{ shape: LoadingShape }>) {
  return (
    <div className="skeleton-sweep grid min-w-0">
      <ShapeBody shape={shape} />
    </div>
  );
}

function ShapeBody({ shape }: Readonly<{ shape: LoadingShape }>) {
  switch (shape.kind) {
    case 'table':
      return <TableBlocks columns={shape.columns} desktopOnly={shape.desktopOnly} />;
    case 'figures':
      return <FigureBlocks count={shape.count} />;
    case 'chart': {
      const plot = <SkeletonBlock className={cn('w-full', CHART_HEIGHT[shape.height ?? 'md'])} />;
      return shape.keyed ? <KeyedChartBlocks plot={plot} /> : plot;
    }
    case 'facts':
      return <FactBlocks rows={shape.rows} tagRows={shape.tagRows} />;
    case 'list':
      return <ListBlocks rows={shape.rows} />;
    case 'thread':
      return <ThreadBlocks />;
    default: {
      const exhaustive: never = shape;
      return exhaustive;
    }
  }
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** One caption line: the caption's line height, a block inside. */
function CaptionLine({ width }: Readonly<{ width: string }>) {
  return (
    <span className="type-caption flex h-lh items-center">
      <SkeletonBlock className={width} />
    </span>
  );
}

/** A line chart over time: its key, the plot, its event key, then the caption under it. */
function KeyedChartBlocks({ plot }: Readonly<{ plot: ReactNode }>) {
  return (
    <div className="grid gap-[var(--compact-gap)]">
      <div className="flex min-w-0 flex-col gap-4">
        <CaptionLine width="w-48" />
        {plot}
        <CaptionLine width="w-3/5" />
      </div>
      <CaptionLine width="w-2/5" />
    </div>
  );
}

/** A card's title: one 16×160 block. */
function TitleBlock() {
  return <SkeletonBlock className="h-4 w-40 max-w-full" />;
}

/** An Overview widget as it loads, unboxed: its title's line over its body's shape. */
export function WidgetCardBlocks({ shape }: Readonly<{ shape: LoadingShape }>) {
  return (
    <div className="skeleton-sweep flex h-full flex-col gap-[var(--workspace-gap)]">
      <span className="flex h-6 items-center">
        <TitleBlock />
      </span>
      <ShapeBlocks shape={shape} />
    </div>
  );
}

/** A report as it loads: its meta line's block (16×240) over its cards. */
export function ReportSkeletonFrame({
  label,
  variant,
  children,
}: Readonly<{ label: string; variant: string; children: ReactNode }>) {
  return (
    <SkeletonFrame
      label={label}
      variant={variant}
      className="flex flex-col gap-[var(--page-top-gap)]"
    >
      <span className="flex h-4 items-center">
        <SkeletonBlock className="w-60 max-w-full" />
      </span>
      {children}
    </SkeletonFrame>
  );
}

/** A record's identity card: 40px rows of a name block (30%) and a value block (45%) or a 24px tag. */
function FactBlocks({
  rows = 3,
  tagRows = [],
}: Readonly<{ rows?: number; tagRows?: readonly number[] }>) {
  return (
    <span className="grid">
      {range(rows).map((row) => (
        <span key={row} className="flex h-10 items-center gap-4">
          <SkeletonBlock className="h-3.5 w-[30%]" />
          {tagRows.includes(row) ? (
            <SkeletonBlock className="h-6 w-16" />
          ) : (
            <SkeletonBlock className="h-3.5 w-[45%]" />
          )}
        </span>
      ))}
    </span>
  );
}

/** A list: 48px rows of a 32 tile and one block at 50%. */
function ListBlocks({ rows = 3 }: Readonly<{ rows?: number }>) {
  return (
    <span className="grid">
      {range(rows).map((row) => (
        <span key={row} className="flex h-12 items-center gap-3">
          <SkeletonBlock className="size-8 shrink-0" />
          <SkeletonBlock className="h-3.5 w-1/2" />
        </span>
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

/**
 * A table: the loaded head's height on `well`, then 40px rows of cell blocks,
 * one per visible column; the last `desktopOnly` cells show from the `desktop` width.
 */
export function TableBlocks({
  columns = 4,
  desktopOnly = 0,
  rows = 5,
}: Readonly<{ columns?: number; desktopOnly?: number; rows?: number }>) {
  const cells = range(Math.max(1, columns));
  const width = (cell: number) =>
    cn(cellWidth(columns, cell), cell >= columns - desktopOnly && 'desktop:block hidden');
  return (
    <span className="grid">
      <span className="bg-well block h-[var(--table-header-height)] rounded-sm" />
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

/**
 * FigureStrip's row (`figureRows`) and cells, with its lines and dividers
 * (globals.css): a 12px label block at 40% on the label's 20px line over a
 * 16×56 value block on the value's 24px line, 72 tall.
 */
export function FigureBlocks({ count = 3 }: Readonly<{ count?: number }>) {
  const { ref, width } = useStripWidth<HTMLSpanElement>();
  const cells = figureRowCells({ count, width });
  return (
    <span ref={ref} data-figure-strip="" className="flex min-w-0 flex-wrap">
      {cells.map(({ size, rowStart }, index) => (
        <span
          key={index}
          data-figure-cell=""
          data-row-start={rowStart || undefined}
          style={{ '--row': size } as CSSProperties}
        >
          <span className="flex h-5 items-center">
            <SkeletonBlock className="w-2/5" />
          </span>
          <span data-figure-value="" className="flex items-center">
            <SkeletonBlock className="h-4 w-14" />
          </span>
        </span>
      ))}
    </span>
  );
}

/** A block at a named radius: cn() does not merge the named radii over SkeletonBlock's rounded-sm. */
function RoundBlock({ className }: Readonly<{ className: string }>) {
  return (
    <span aria-hidden data-skeleton-block="" className={cn('skeleton-sweep bg-well', className)} />
  );
}

/**
 * A chat, inset like AgentThread: the person's turn on the right (40 high,
 * 45%, radius 8), then the reply's two paragraph blocks on the left, no card.
 */
function ThreadBlocks() {
  return (
    <span className="grid gap-[var(--card-padding)] px-4">
      <RoundBlock className="rounded-card ms-auto block h-10 w-[45%]" />
      <span className="grid gap-2">
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-[70%]" />
      </span>
    </span>
  );
}

/**
 * The composer's card (ComposerFrame): `surface` at radius 8 on `shadow-pop`,
 * an 8 inset, the one-line field's 30, then the 32 control row with the
 * round Send block at its end. No text.
 */
export function ComposerBlocks() {
  return (
    <span className="bg-surface border-rule rounded-card shadow-pop grid gap-1 border p-2">
      <span className="block h-[30px]" />
      <span className="flex h-[var(--control-md)] items-center justify-end">
        <RoundBlock className="block size-8 rounded-full" />
      </span>
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
