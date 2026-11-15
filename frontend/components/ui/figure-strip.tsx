import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { RungMeter } from '@/components/ui/rung-meter';
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
    icon?: LucideIcon;
    /** The absence's word. Defaults to "not measured". */
    missingLabel?: string;
    loading?: boolean;
    /** A small mark at the end of the label row (series key, info hint). */
    marker?: ReactNode;
    /** A caption above the value, e.g. the period it covers. */
    caption?: ReactNode;
    delta?: ReactNode;
    /** The basis under the value, in `caption`. */
    sub?: ReactNode;
    /** A second window's own value under the first (never a ratio). */
    comparison?: Readonly<{ label: ReactNode; value: string | null }>;
    /** One link or button at the figure's foot. */
    action?: ReactNode;
  } & FigureValue &
    FigureAction
>;

/** Columns from 720px of column width: up to four, more balanced across rows. */
const WIDE_COLUMNS = {
  1: '@min-[720px]:grid-cols-1',
  2: '@min-[720px]:grid-cols-2',
  3: '@min-[720px]:grid-cols-3',
  4: '@min-[720px]:grid-cols-4',
} as const;

type Columns = keyof typeof WIDE_COLUMNS;

function columnsFor(count: number): Columns {
  const rows = Math.ceil(count / 4);
  return Math.max(1, Math.min(4, Math.ceil(count / Math.max(1, rows)))) as Columns;
}

/**
 * FigureStrip — key figures side by side under one ink rule, divided by
 * hairlines: four across from 720px of column width,
 * two across below. Each figure is the Figure anatomy: overline label, the
 * value at `figure` (or its Absence), the change, the basis. A 0–100 score
 * is a RungMeter, never a ring. A record page passes its summary as `lead`,
 * which opens the strip above a hairline.
 *
 * A figure with `onSelect` is pressable: the whole cell is the target, named
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
  const columns = columnsFor(segments.length);
  return (
    <div className="border-t-rule-ink border-b-rule @container min-w-0 overflow-hidden border-y">
      {lead ? <div className="border-rule border-b p-4">{lead}</div> : null}
      <dl // NOSONAR -- a <fieldset> would add form-group semantics and its own border to a grid of figures
        role={label ? 'group' : undefined}
        aria-label={label}
        data-testid={testId}
        data-figure-strip=""
        className={cn(
          '-me-px -mb-px grid min-w-0',
          segments.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
          WIDE_COLUMNS[columns],
        )}
      >
        {segments.map((segment) => (
          <FigureCell key={segment.key} segment={segment} />
        ))}
      </dl>
    </div>
  );
}

function FigureCell({ segment }: Readonly<{ segment: FigureSegment }>) {
  const pressable = Boolean(segment.onSelect);
  return (
    <div
      data-figure-cell=""
      className={cn(
        'border-rule grid min-w-0 content-start gap-1 border-e border-b p-4',
        pressable &&
          cn(
            'relative transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
            segment.selected ? 'overlay-selected' : 'hover:overlay-hover',
          ),
      )}
    >
      <FigureLabel segment={segment} />
      <FigureBody segment={segment} />
      <FigureFoot segment={segment} />
      {pressable ? (
        <button
          type="button"
          onClick={segment.onSelect}
          aria-label={segment.actionLabel}
          aria-pressed={segment.selected}
          className="focus-ring absolute inset-0"
        />
      ) : null}
    </div>
  );
}

type FigurePart = Readonly<{ segment: FigureSegment }>;

/** The overline row: a label wraps to a second line rather than cutting a metric's name. */
function FigureLabel({ segment }: FigurePart) {
  const Glyph = segment.icon;
  return (
    <dt className="type-overline flex min-w-0 items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1">
        {Glyph ? <Glyph className="size-4 shrink-0" aria-hidden /> : null}
        <span className="line-clamp-2 min-w-0">{segment.label}</span>
      </span>
      {segment.marker ? (
        <span
          className={cn(
            'flex shrink-0 items-center gap-2 normal-case',
            segment.onSelect && 'relative z-10',
          )}
        >
          {segment.marker}
        </span>
      ) : null}
    </dt>
  );
}

function FigureBody({ segment }: FigurePart) {
  return (
    <dd className="grid min-w-0 gap-1">
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

/** Change, basis, comparison and the one action, in that order. */
function FigureFoot({ segment }: FigurePart) {
  return (
    <>
      {segment.delta ? <dd className="min-w-0">{segment.delta}</dd> : null}
      {segment.sub ? <dd className="type-caption min-w-0">{segment.sub}</dd> : null}
      {segment.comparison ? (
        <dd data-figure-comparison="" className="type-caption grid min-w-0 pt-1">
          <span>{segment.comparison.label}</span>
          <Value
            value={segment.comparison.value}
            absentLabel={segment.missingLabel}
            loading={segment.loading ?? false}
          />
        </dd>
      ) : null}
      {segment.action ? (
        <dd className={cn('min-w-0', segment.onSelect && 'relative z-10')}>{segment.action}</dd>
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
        className="min-w-0 [overflow-wrap:anywhere]"
      />
    );
  }
  return <div className="type-figure min-w-0">{value}</div>;
}
