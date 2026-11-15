import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';

import { RungMeter } from '@/components/ui/rung-meter';
import { ClampText } from '@/components/ui/clamp-text';
import { Value } from '@/components/ui/value';
import { cn } from '@/lib/utils';

type FigureValue =
  | { value: ReactNode; score?: undefined }
  /** A 0–100 score: a RungMeter with its number, named by `label`. */
  | { score: Readonly<{ value: number; label: string; unit?: '%' }>; value?: undefined };

type FigureAction =
  | { onSelect?: undefined; actionLabel?: undefined; selected?: undefined }
  | { onSelect: () => void; actionLabel: string; selected?: boolean };

export type FigureSegment = Readonly<
  {
    key: string;
    label: ReactNode;
    /** An icon tile heading the card; give one to every figure of a strip or to none. */
    icon?: LucideIcon;
    /** The absence's word. Defaults to "not measured". */
    missingLabel?: string;
    loading?: boolean;
    /** A small mark at the end of the label row (series key, info hint). */
    marker?: ReactNode;
    /** A caption above the value, e.g. the period it covers. */
    caption?: ReactNode;
    delta?: ReactNode;
    /** The basis, on the delta's line, in `caption`. */
    sub?: ReactNode;
    /** A second window's own value under the first (never a ratio). */
    comparison?: Readonly<{ label: ReactNode; value: string | null }>;
    /** One link or button at the figure's foot. */
    action?: ReactNode;
  } & FigureValue &
    FigureAction
>;

/** The narrowest a figure's cell may be before the strip takes fewer per row. */
const FIGURE_MIN_WIDTH = 160;
/** The gap between figures, in both directions. */
const FIGURE_GAP = 16;

/** Most figures one row holds when the strip does not fit on one row. */
function rowCap(count: number): number {
  return count <= 6 ? 3 : 4;
}

/** `count` figures in rows of at most `cap`, the fuller rows first. */
function balancedRows(count: number, cap: number): number[] {
  const rows = Math.ceil(count / cap);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < extra ? 1 : 0));
}

/**
 * The figures per row for `count` figures in a strip `width` px wide. Columns
 * come from the count, never the width alone: 2 to 4, and 5 or 6 when each
 * cell keeps 160px, sit on one row; otherwise 5 are 3 + 2, 6 are 3 + 3, 7 are
 * 4 + 3 and 8 are 4 + 4. When cells would be narrower than 160px a row takes
 * fewer (4 become 2 + 2, 3 stack). No row holds one figure alone unless the
 * strip has one, or three stack.
 */
export function figureRows(count: number, width: number): number[] {
  if (count <= 0) return [];
  const fits = (perRow: number) => (width - FIGURE_GAP * (perRow - 1)) / perRow >= FIGURE_MIN_WIDTH;
  if (count <= 2) return [count];
  if (count <= 6 && fits(count)) return [count];
  if (count === 3) return [1, 1, 1];
  for (let cap = rowCap(count); cap >= 3; cap -= 1) {
    if (fits(cap)) return balancedRows(count, cap);
  }
  const pairs = balancedRows(count, 2);
  // An odd figure joins the row before it rather than standing alone.
  if (pairs.at(-1) === 1) {
    pairs.pop();
    pairs[pairs.length - 1] = 3;
  }
  return [...pairs].sort((a, b) => b - a);
}

/** The strip's width, kept current; wide until measured. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * FigureStrip — key figures as stat cards on the ground, 16 apart. Inside a
 * card (a Section, a slip, a dialog) the figures are cells 16 apart with no
 * edges and no dividers (globals.css "r3 a2 figures"). Rows come from
 * `figureRows`. Each figure is the Figure anatomy: an optional icon tile, the
 * label on one line (so values in a row share a baseline), the value at
 * `figure` (or its Absence), then the change and its basis on one line. A
 * 0–100 score is a RungMeter. A record page passes its summary as `lead`,
 * which opens the strip as a card of its own.
 *
 * A figure with `onSelect` is pressable: the whole card is the target, named
 * by `actionLabel`; `selected` makes it a toggle (`aria-pressed`).
 */
export function FigureStrip({
  segments,
  label,
  testId,
  lead,
}: Readonly<{
  segments: readonly FigureSegment[];
  /** Accessible name for the group, when the section heading does not give one. */
  label?: string;
  testId?: string;
  lead?: ReactNode;
}>) {
  const { ref, width } = useWidth();
  const rows = figureRows(segments.length, width);
  const sizes = rows.flatMap((size) => Array.from({ length: size }, () => size));
  return (
    <div ref={ref} data-figure-strip-frame="" className="grid min-w-0 gap-4">
      {lead ? <div data-figure-lead="">{lead}</div> : null}
      <dl // NOSONAR -- a <fieldset> would add form-group semantics and its own border to a grid of figures
        role={label ? 'group' : undefined}
        aria-label={label}
        data-testid={testId}
        data-figure-strip=""
        className="flex min-w-0 flex-wrap gap-4"
      >
        {segments.map((segment, index) => (
          <FigureCell key={segment.key} segment={segment} rowSize={sizes[index] ?? 1} />
        ))}
      </dl>
    </div>
  );
}

function FigureCell({ segment, rowSize }: Readonly<{ segment: FigureSegment; rowSize: number }>) {
  const pressable = Boolean(segment.onSelect);
  return (
    <div
      data-figure-cell=""
      data-row-size={rowSize}
      data-pressable={pressable || undefined}
      data-selected={segment.selected || undefined}
      className="relative grid min-w-0 content-start gap-2"
    >
      {segment.icon ? <IconTile icon={segment.icon} /> : null}
      <FigureLabel segment={segment} />
      <FigureBody segment={segment} />
      <FigureFoot segment={segment} />
      {pressable ? (
        <button
          type="button"
          onClick={segment.onSelect}
          aria-label={segment.actionLabel}
          aria-pressed={segment.selected}
          className="focus-ring absolute inset-0 rounded-[inherit]"
        />
      ) : null}
    </div>
  );
}

function IconTile({ icon: Glyph }: Readonly<{ icon: LucideIcon }>) {
  return (
    <span aria-hidden data-icon-tile="" className="text-ink-2 grid place-items-center">
      <Glyph className="size-4" />
    </span>
  );
}

type FigurePart = Readonly<{ segment: FigureSegment }>;

/** The label on one line, cut with its whole text reachable, and its marker. */
function FigureLabel({ segment }: FigurePart) {
  return (
    <dt className="type-body text-ink-2 flex min-w-0 items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        {segment.selected ? <Check className="text-ink size-4 shrink-0" aria-hidden /> : null}
        <ClampText className="min-w-0">{segment.label}</ClampText>
      </span>
      {segment.marker ? (
        <span className={cn('flex shrink-0 items-center gap-2', pressableLayer(segment))}>
          {segment.marker}
        </span>
      ) : null}
    </dt>
  );
}

/** Controls inside a pressable figure sit above its whole-card button. */
function pressableLayer(segment: FigureSegment) {
  return segment.onSelect ? 'relative z-10' : undefined;
}

function FigureBody({ segment }: FigurePart) {
  return (
    <dd className="grid min-w-0 gap-2">
      {segment.caption ? <span className="type-caption">{segment.caption}</span> : null}
      {segment.score ? (
        <>
          <Value text="figure" value={scoreText(segment.score)} />
          <RungMeter
            value={segment.score.value}
            valueLabel={
              segment.score.unit
                ? scoreText(segment.score)
                : `${scoreText(segment.score)} out of 100`
            }
            label={segment.score.label}
            headless
          />
        </>
      ) : (
        <FigureValue segment={segment} />
      )}
    </dd>
  );
}

function scoreText(score: Readonly<{ value: number; unit?: '%' }>) {
  return `${Math.round(score.value)}${score.unit ?? ''}`;
}

/** The change and its basis on one line, then the comparison and the one action. */
function FigureFoot({ segment }: FigurePart) {
  return (
    <>
      {segment.delta || segment.sub ? (
        <dd className="flex min-w-0 items-baseline gap-2">
          {segment.delta ? <span className="shrink-0">{segment.delta}</span> : null}
          {segment.sub ? (
            <ClampText className="type-caption min-w-0">{segment.sub}</ClampText>
          ) : null}
        </dd>
      ) : null}
      {segment.comparison ? (
        <dd data-figure-comparison="" className="type-caption grid min-w-0">
          <span>{segment.comparison.label}</span>
          <Value
            value={segment.comparison.value}
            absentLabel={segment.missingLabel}
            loading={segment.loading ?? false}
          />
        </dd>
      ) : null}
      {segment.action ? (
        <dd className={cn('min-w-0', pressableLayer(segment))}>{segment.action}</dd>
      ) : null}
    </>
  );
}

function FigureValue({ segment }: FigurePart) {
  const { value } = segment;
  if (segment.loading || value == null || typeof value === 'string' || typeof value === 'number') {
    return (
      <Value
        text="figure"
        value={value == null ? null : String(value)}
        absentLabel={segment.missingLabel}
        loading={segment.loading ?? false}
        className="max-w-full min-w-0 overflow-hidden"
      />
    );
  }
  return <div className="type-figure min-w-0 truncate">{value}</div>;
}
