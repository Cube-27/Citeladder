import { useEffect, useState, type ReactNode } from 'react';

import type { ChartHeight } from '@/components/ui/chart';
import { THREAD_OPENING } from '@/components/ui/thread-opening';
import { LOADING_INDICATOR_DELAY_MS } from '@/lib/config/operational';
import { cn } from '@/lib/utils';

const SKELETON_WIDTH = {
  auto: undefined,
  full: 'w-full',
  '4/5': 'w-4/5',
  '3/4': 'w-3/4',
  '7/10': 'w-7/10',
  '3/5': 'w-3/5',
  '1/2': 'w-1/2',
  '9/20': 'w-9/20',
  '2/5': 'w-2/5',
  '3/10': 'w-3/10',
  '1/5': 'w-1/5',
  '3/20': 'w-3/20',
  '8': 'w-8',
  '12': 'w-12',
  '16': 'w-16',
  '24': 'w-24',
  '32': 'w-32',
  '48': 'w-48',
  '64': 'w-64',
  '20-fit': 'w-20 max-w-full',
  '40-fit': 'w-40 max-w-full',
  '60-fit': 'w-60 max-w-full',
  fill: 'flex-1',
} as const;

export type SkeletonWidth = keyof typeof SKELETON_WIDTH;

const SKELETON_HEIGHT = {
  line: undefined,
  '4': 'h-4',
  '5': 'h-5',
  '6': 'h-6',
  '7': 'h-7',
  '8': 'h-8',
  '10': 'h-10',
  tile: 'h-10 min-h-10',
  control: 'h-control-md',
  'chart-sm': 'h-chart-sm',
  'chart-md': 'h-chart-md',
  'chart-lg': 'h-chart-lg',
} as const;

type SkeletonHeight = keyof typeof SKELETON_HEIGHT;

const SKELETON_SHAPE = {
  mark: undefined,
  control: 'rounded-control',
  card: 'rounded-card',
  round: 'rounded-full',
} as const;

const SKELETON_PLACE = {
  flow: undefined,
  fixed: 'shrink-0',
  center: 'mx-auto',
  end: 'ms-auto',
} as const;

export function SkeletonBlock({
  width = 'auto',
  height = 'line',
  shape = 'mark',
  place = 'flow',
  desktopOnly = false,
}: Readonly<{
  width?: SkeletonWidth;
  height?: SkeletonHeight;
  shape?: keyof typeof SKELETON_SHAPE;
  place?: keyof typeof SKELETON_PLACE;
  desktopOnly?: boolean;
}>) {
  return (
    <span
      aria-hidden
      data-skeleton-block=""
      className={cn(
        'skeleton-sweep bg-well rounded-mark block h-3 min-h-3',
        SKELETON_HEIGHT[height],
        SKELETON_WIDTH[width],
        SKELETON_SHAPE[shape],
        SKELETON_PLACE[place],
        desktopOnly && 'desktop:block hidden',
      )}
    />
  );
}

export function CountPlaceholder() {
  return <span aria-hidden className="bg-well rounded-control inline-block h-3 w-[3ch]" />;
}

export const TEXT_WIDTHS = ['full', '4/5', '3/5'] as const;

export type LoadingShape =
  | Readonly<{ kind: 'table'; columns?: number; desktopOnly?: number }>
  | Readonly<{ kind: 'figures'; count?: number }>
  | Readonly<{ kind: 'chart'; height?: ChartHeight; keyed?: boolean }>
  | Readonly<{ kind: 'facts'; rows?: number; tagRows?: readonly number[] }>
  | Readonly<{ kind: 'list'; rows?: number }>
  | Readonly<{ kind: 'thread' }>;

const CHART_HEIGHT = {
  sm: 'chart-sm',
  md: 'chart-md',
  lg: 'chart-lg',
} as const satisfies Record<ChartHeight, SkeletonHeight>;

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
      const plot = <SkeletonBlock width="full" height={CHART_HEIGHT[shape.height ?? 'md']} />;
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

function CaptionLine({ width }: Readonly<{ width: SkeletonWidth }>) {
  return (
    <span className="text-caption text-ink-2 flex h-lh items-center">
      <SkeletonBlock width={width} />
    </span>
  );
}

function KeyedChartBlocks({ plot }: Readonly<{ plot: ReactNode }>) {
  return (
    <div className="gap-compact grid">
      <div className="flex min-w-0 flex-col gap-4">
        <CaptionLine width="48" />
        {plot}
        <CaptionLine width="3/5" />
      </div>
      <CaptionLine width="2/5" />
    </div>
  );
}

function TitleBlock() {
  return <SkeletonBlock height="4" width="40-fit" />;
}

export function WidgetCardBlocks({ shape }: Readonly<{ shape: LoadingShape }>) {
  return (
    <div className="skeleton-sweep gap-workspace flex h-full flex-col">
      <span className="flex h-6 items-center">
        <TitleBlock />
      </span>
      <ShapeBlocks shape={shape} />
    </div>
  );
}

export function ReportSkeletonFrame({
  label,
  variant,
  children,
}: Readonly<{ label: string; variant: string; children: ReactNode }>) {
  return (
    <SkeletonFrame label={label} variant={variant} layout="report">
      <span className="flex h-4 items-center">
        <SkeletonBlock width="60-fit" />
      </span>
      {children}
    </SkeletonFrame>
  );
}

function FactBlocks({
  rows = 3,
  tagRows = [],
}: Readonly<{ rows?: number; tagRows?: readonly number[] }>) {
  return (
    <span className="grid">
      {range(rows).map((row) => (
        <span key={row} className="flex h-10 items-center gap-4">
          <SkeletonBlock height="4" width="3/10" />
          {tagRows.includes(row) ? (
            <SkeletonBlock height="6" width="16" />
          ) : (
            <SkeletonBlock height="5" width="9/20" />
          )}
        </span>
      ))}
    </span>
  );
}

function ListBlocks({ rows = 3 }: Readonly<{ rows?: number }>) {
  return (
    <span className="grid">
      {range(rows).map((row) => (
        <span key={row} className="flex h-12 items-center gap-3">
          <SkeletonBlock height="8" width="8" place="fixed" />
          <span className="grid min-w-0 flex-1 gap-1">
            <SkeletonBlock height="4" width="1/2" />
            <SkeletonBlock width="3/10" />
          </span>
        </span>
      ))}
    </span>
  );
}

const CELL_WIDTHS = ['2/5', '1/5', '3/20', '3/20'] as const;

function cellWidth(columns: number, cell: number): SkeletonWidth {
  if (columns === CELL_WIDTHS.length) return CELL_WIDTHS[cell] ?? 'fill';
  return cell === 0 ? '2/5' : 'fill';
}

export function TableBlocks({
  columns = 4,
  desktopOnly = 0,
  rows = 5,
}: Readonly<{ columns?: number; desktopOnly?: number; rows?: number }>) {
  const cells = range(Math.max(1, columns));
  return (
    <span className="grid">
      <span className="bg-well rounded-mark h-table-head block" />
      {range(rows).map((row) => (
        <span key={row} className="flex h-10 items-center gap-4 px-4">
          {cells.map((cell) => (
            <SkeletonBlock
              key={cell}
              height="7"
              width={cellWidth(columns, cell)}
              desktopOnly={cell >= columns - desktopOnly}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

export function FigureBlocks({ count = 3 }: Readonly<{ count?: number }>) {
  return (
    <span data-figure-strip="" className="flex min-w-0">
      {range(count).map((index) => (
        <span key={index} data-figure-cell="">
          <span className="flex h-4 items-center">
            <SkeletonBlock width="1/2" />
          </span>
          <span data-figure-value="" className="flex items-center">
            <SkeletonBlock height="5" width="20-fit" />
          </span>
        </span>
      ))}
    </span>
  );
}

function ThreadBlocks() {
  return (
    <span className="gap-card grid px-4">
      <SkeletonBlock shape="card" place="end" height="10" width="9/20" />
      <span className="grid gap-2">
        <SkeletonBlock height="4" width="full" />
        <SkeletonBlock height="4" width="7/10" />
      </span>
    </span>
  );
}

export function ComposerBlocks() {
  return (
    <span className="bg-panel border-rule rounded-card shadow-pop grid gap-1 border p-2">
      <span className="block h-7.5" />
      <span className="h-control-md flex items-center justify-end">
        <SkeletonBlock height="8" width="8" shape="round" />
      </span>
    </span>
  );
}

const FRAME_LAYOUT = {
  workspace: 'flex flex-col gap-workspace',
  section: 'flex flex-col gap-section',
  report: 'flex flex-col gap-page-top',
  opening: THREAD_OPENING,
} as const;

export function OpeningTitleBlocks() {
  return (
    <span className="flex h-7 items-center justify-center">
      <SkeletonBlock height="5" width="60-fit" />
    </span>
  );
}

export function DockedComposerBlocks() {
  return (
    <div className="shrink-0 pt-2 pb-4">
      <ComposerBlocks />
    </div>
  );
}

export function SkeletonFrame({
  label,
  variant,
  layout,
  className,
  children,
}: Readonly<{
  label: string;
  variant: string;
  layout?: keyof typeof FRAME_LAYOUT;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <div
      aria-busy="true"
      data-skeleton={variant}
      className={cn('min-w-0', layout && FRAME_LAYOUT[layout], className)}
    >
      <LiveVerb label={label} />
      {children}
    </div>
  );
}

let revealedLoaders = 0;

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
