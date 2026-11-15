import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';

import { ClampText } from '@/components/ui/clamp-text';
import { ScoreRing } from '@/components/ui/score-ring';
import { TextLink } from '@/components/ui/text-link';
import { Value } from '@/components/ui/value';
import { cn } from '@/lib/utils';

type FigureValue =
  | {
      value: ReactNode;
      score?: undefined;
      /** An icon tile beside the figure; give one to every figure of a strip or to none. */
      icon?: LucideIcon;
    }
  /** A 0–100 score: a ScoreRing with its number inside, named by `label`. */
  | {
      score: Readonly<{ value: number; label: string; unit?: '%' }>;
      value?: undefined;
      icon?: undefined;
    };

type FigureAction =
  | { onSelect?: undefined; actionLabel?: undefined; selected?: undefined }
  | { onSelect: () => void; actionLabel: string; selected?: boolean };

/** The one text link at the end of a figure's basis line. */
type FigureLink = Readonly<
  { label: string } & (
    | { href: string; projectId?: string; onSelect?: undefined }
    | { onSelect: () => void; href?: undefined; projectId?: undefined }
  )
>;

export type FigureSegment = Readonly<
  {
    key: string;
    label: ReactNode;
    /** The absence's word. Defaults to "Not measured". */
    missingLabel?: string;
    loading?: boolean;
    /** A small mark at the end of the label line (series key, info hint). */
    marker?: ReactNode;
    /** The period the value covers, e.g. "Last 30 days"; opens the basis line. */
    caption?: ReactNode;
    delta?: ReactNode;
    /** The basis, on the basis line. */
    sub?: ReactNode;
    /** A second window's own value, on the basis line (never a ratio). */
    comparison?: Readonly<{ label: ReactNode; value: string | null }>;
    action?: FigureLink;
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

const cellWidth = (width: number, perRow: number) => (width - FIGURE_GAP * (perRow - 1)) / perRow;

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
  const fits = (perRow: number) => cellWidth(width, perRow) >= FIGURE_MIN_WIDTH;
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
 * FigureStrip — key figures as metric cards on the ground, 16 apart; inside a
 * card they are cells with no edges (globals.css "r3 a2 figures"). Rows come
 * from `figureRows`. A card is at most three lines: the label (and its
 * marker), the value with its Delta, then the basis line holding the caption,
 * basis, comparison and one text link. An icon tile or a score's ScoreRing
 * sits at the left. A score is only ever a ring, never a bar.
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
        {segments.map((segment, index) => {
          const rowSize = sizes[index] ?? 1;
          return (
            <FigureCell
              key={segment.key}
              segment={segment}
              rowSize={rowSize}
              narrow={cellWidth(width, rowSize) < FIGURE_MIN_WIDTH}
            />
          );
        })}
      </dl>
    </div>
  );
}

function FigureCell({
  segment,
  rowSize,
  narrow,
}: Readonly<{ segment: FigureSegment; rowSize: number; narrow: boolean }>) {
  const pressable = Boolean(segment.onSelect);
  let leadKind: 'score' | 'icon' | undefined;
  if (segment.score) leadKind = 'score';
  else if (segment.icon) leadKind = 'icon';
  return (
    <div
      data-figure-cell=""
      data-row-size={rowSize}
      data-figure-kind={leadKind}
      // A narrow row's labels may take two lines, so every label in it reserves two.
      data-label-lines={narrow ? 2 : undefined}
      data-pressable={pressable || undefined}
      data-selected={segment.selected || undefined}
      className="relative min-w-0"
    >
      <FigureLabel segment={segment} />
      <FigureLead segment={segment} />
      {segment.score ? null : <FigureValueLine segment={segment} />}
      <FigureBasis segment={segment} />
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

type FigurePart = Readonly<{ segment: FigureSegment }>;

/** A loading block in the `well`, standing in for text or a ring. */
function Block({ className, ring = false }: Readonly<{ className: string; ring?: boolean }>) {
  return (
    <span
      aria-hidden
      data-figure-block={ring ? 'ring' : 'text'}
      className={cn('bg-well block', className)}
    />
  );
}

/** The label, wrapping between words but never cut, and its marker at the line's end. */
function FigureLabel({ segment }: FigurePart) {
  const text = segment.loading ? (
    <>
      <span className="sr-only">{segment.label}</span>
      <Block className="h-[14px] w-24" />
    </>
  ) : (
    <span className="min-w-0">{segment.label}</span>
  );
  return (
    <dt className="type-body text-ink-2 flex min-w-0 items-start justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 self-center">
        {segment.selected ? <Check className="text-ink size-4 shrink-0" aria-hidden /> : null}
        {text}
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

/** The icon tile or the score's ring, at the card's left. */
function FigureLead({ segment }: FigurePart) {
  if (segment.score) {
    return (
      <dd data-figure-lead-slot="">
        {segment.loading ? (
          <Block ring className="size-16" />
        ) : (
          <ScoreRing
            value={segment.score.value}
            label={segment.score.label}
            unit={segment.score.unit}
            tone="auto"
          />
        )}
      </dd>
    );
  }
  if (!segment.icon) return null;
  const Glyph = segment.icon;
  return (
    <dd aria-hidden data-figure-lead-slot="" data-icon-tile="">
      <Glyph className="text-ink-2 size-5" />
    </dd>
  );
}

/** Line 2 of a value card: the value (or its absence's word) and its Delta on one baseline. */
function FigureValueLine({ segment }: FigurePart) {
  return (
    <dd data-figure-value="" className="flex min-h-8 min-w-0 items-baseline gap-2">
      <FigureValue segment={segment} />
      {segment.delta && !segment.loading ? <span className="shrink-0">{segment.delta}</span> : null}
    </dd>
  );
}

function FigureValue({ segment }: FigurePart) {
  const { value } = segment;
  if (segment.loading)
    return (
      <span className="flex h-8 items-center">
        <span className="sr-only">Loading</span>
        <Block className="h-6 w-16" />
      </span>
    );
  if (value == null)
    return (
      <Value text="figure" value={null} absentLabel={segment.missingLabel ?? 'Not measured'} />
    );
  if (typeof value === 'string' || typeof value === 'number')
    return (
      <ClampText className="type-figure text-ink min-w-0 tabular-nums">{String(value)}</ClampText>
    );
  return <div className="type-figure text-ink min-w-0 truncate">{value}</div>;
}

/**
 * The basis line: a score's Delta, then the caption, basis and comparison
 * joined with " · ", and the one text link at its end.
 */
function FigureBasis({ segment }: FigurePart) {
  if (segment.loading) return null;
  const parts = [
    { key: 'caption', node: segment.caption },
    { key: 'sub', node: segment.sub },
    { key: 'comparison', node: comparisonText(segment) },
  ].filter((part) => Boolean(part.node));
  const delta = segment.score ? segment.delta : null;
  if (!delta && !parts.length && !segment.action) return null;
  return (
    <dd data-figure-basis="" className="type-caption flex min-w-0 items-baseline gap-2">
      {delta ? <span className="shrink-0">{delta}</span> : null}
      {parts.length ? (
        <ClampText className="min-w-0">
          {parts.map((part, index) => (
            <span key={part.key}>
              {index ? ' · ' : null}
              {part.node}
            </span>
          ))}
        </ClampText>
      ) : null}
      {segment.action ? (
        <span className={cn('ms-auto shrink-0', pressableLayer(segment))}>
          <FigureActionLink action={segment.action} />
        </span>
      ) : null}
    </dd>
  );
}

function comparisonText(segment: FigureSegment): ReactNode {
  const { comparison } = segment;
  if (!comparison) return null;
  return (
    <span data-figure-comparison="">
      {comparison.label}{' '}
      <span className="tabular-nums">
        {comparison.value ?? segment.missingLabel ?? 'Not measured'}
      </span>
    </span>
  );
}

function FigureActionLink({ action }: Readonly<{ action: FigureLink }>) {
  if (action.onSelect)
    return (
      <TextLink asChild text="caption">
        <button type="button" onClick={action.onSelect}>
          {action.label}
        </button>
      </TextLink>
    );
  return (
    <TextLink href={action.href} projectId={action.projectId} text="caption">
      {action.label}
    </TextLink>
  );
}
