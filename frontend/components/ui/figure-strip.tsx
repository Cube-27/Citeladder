import {
  Fragment,
  isValidElement,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

import { Absence } from '@/components/ui/absence';
import { Delta } from '@/components/ui/delta';
import {
  cellWidth,
  FIGURE_MIN_WIDTH,
  figureRowCells,
  useStripWidth,
} from '@/components/ui/figure-rows';
import { InfoHint } from '@/components/ui/info-hint';
import { ScoreRing } from '@/components/ui/score-ring';
import { TextLink } from '@/components/ui/text-link';
import { absenceOf, availabilityLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

type FigureValue =
  | {
      value: ReactNode;
      score?: undefined;
      /** A glyph before the label; give one to every figure of a strip or to none. */
      icon?: LucideIcon;
    }
  /** A 0–100 score: its number after a small ScoreRing, named by `label`. */
  | {
      score: Readonly<{ value: number; label: string; unit?: '%' }>;
      value?: undefined;
      icon?: undefined;
    };

type FigureAction =
  | { onSelect?: undefined; actionLabel?: undefined; selected?: undefined }
  | { onSelect: () => void; actionLabel: string; selected?: boolean };

/** Where the figure's label links; the label itself is the link. */
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
    /** The card's title already names the figure: the label stays only as the `dt`, visually hidden. */
    labelHidden?: boolean;
    /** The absence's word, for its accessible name and tooltip. Defaults to "Not measured". */
    missingLabel?: string;
    loading?: boolean;
    /** A small mark after the label (series key, info hint). */
    marker?: ReactNode;
    /** The period the value covers, e.g. "Last 30 days"; opens the figure's hint. */
    caption?: ReactNode;
    delta?: ReactNode;
    /** The basis: in the figure's hint, or under the value when the strip has `subLine`. */
    sub?: ReactNode;
    /** A second window's own value, in the figure's hint (never a ratio). */
    comparison?: Readonly<{ label: ReactNode; value: string | null }>;
    action?: FigureLink;
  } & FigureValue &
    FigureAction
>;

/**
 * FigureStrip — key figures as one flat row: hairlines above and below, thin
 * dividers between cells, no cards, no gaps (globals.css "FigureStrip"). Cells
 * share the width equally; rows come from `figureRows`, and a wrapped row
 * keeps the same dividers. On the page itself (not in a card) the strip is
 * full-bleed across the gutters, its text inset (globals.css). A cell is two
 * lines, 72 tall: the muted label with
 * its marker and one info hint (caption, basis and comparison joined with
 * " · ") right after it, then the value in body ink with its Delta inline on
 * one baseline. A value at the foot keeps a row's baselines level when a label
 * wraps. A score's value is its number after a 20px ScoreRing (never a bar). A
 * named value (a model, a brand) carries its own logo; a sentiment its dot.
 * A figure with `action` makes its label the link.
 *
 * A figure with `onSelect` is pressable: the whole cell is the target, named
 * by `actionLabel`; `selected` makes it a toggle (`aria-pressed`) and fills
 * the cell with the well.
 *
 * `subLine` shows each figure's `sub` as a visible third line instead of in
 * its hint; every cell keeps the line, so values still share a baseline.
 */
export function FigureStrip({
  segments,
  label,
  testId,
  lead,
  subLine = false,
  twoLineLabels = false,
}: Readonly<{
  segments: readonly FigureSegment[];
  /** Accessible name for the group, when the section heading does not give one. */
  label?: string;
  testId?: string;
  lead?: ReactNode;
  subLine?: boolean;
  /** Labels long enough to wrap at any width: every cell reserves two label lines. */
  twoLineLabels?: boolean;
}>) {
  const { ref, width } = useStripWidth<HTMLDivElement>();
  const cells = figureRowCells({ count: segments.length, width });
  return (
    <div ref={ref} data-figure-strip-frame="" className="grid min-w-0 gap-4">
      {lead ? <div data-figure-lead="">{lead}</div> : null}
      <dl // NOSONAR -- a <fieldset> would add form-group semantics and its own border to a grid of figures
        role={label ? 'group' : undefined}
        aria-label={label}
        data-testid={testId}
        data-figure-strip=""
        className="flex min-w-0 flex-wrap"
      >
        {segments.map((segment, index) => {
          const { size, rowStart } = cells[index] ?? { size: 1, rowStart: true };
          return (
            <FigureCell
              key={segment.key}
              segment={segment}
              subLine={subLine}
              rowSize={size}
              rowStart={rowStart}
              narrow={twoLineLabels || cellWidth(width, size) < FIGURE_MIN_WIDTH}
            />
          );
        })}
      </dl>
    </div>
  );
}

function FigureCell({
  segment,
  subLine,
  rowSize,
  rowStart,
  narrow,
}: Readonly<{
  segment: FigureSegment;
  subLine: boolean;
  rowSize: number;
  rowStart: boolean;
  narrow: boolean;
}>) {
  const pressable = Boolean(segment.onSelect);
  return (
    <div
      data-figure-cell=""
      data-row-start={rowStart || undefined}
      data-sub-line={subLine || undefined}
      // A narrow row's labels may take two lines, so every label in it reserves two.
      data-label-lines={narrow && !segment.labelHidden ? 2 : undefined}
      data-pressable={pressable || undefined}
      data-selected={segment.selected || undefined}
      // The cell's share of its row: `flex-basis` in globals.css reads `--row`.
      style={{ '--row': rowSize } as CSSProperties}
      className={cn(
        'relative min-w-0',
        pressable && !segment.selected && 'hover:overlay-hover active:overlay-pressed',
      )}
    >
      <FigureLabel segment={segment} subLine={subLine} />
      <FigureValueLine segment={segment} subLine={subLine} />
      {subLine ? <FigureSub segment={segment} /> : null}
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

type FigurePart = Readonly<{ segment: FigureSegment; subLine?: boolean }>;

/** A loading block in the `well`, standing in for text. */
function Block({ className }: Readonly<{ className: string }>) {
  return <span aria-hidden data-figure-block="" className={cn('bg-well block', className)} />;
}

/** Line 1: the label (or its link), wrapping between words but never cut, then its marker and hint. */
function FigureLabel({ segment, subLine }: FigurePart) {
  if (segment.labelHidden) return <dt className="sr-only">{segment.label}</dt>;
  let text: ReactNode;
  if (segment.loading)
    text = (
      <>
        <span className="sr-only">{segment.label}</span>
        <Block className="h-[14px] w-24" />
      </>
    );
  else if (segment.action)
    text = (
      <span className={cn('min-w-0', pressableLayer(segment))}>
        <FigureLabelLink action={segment.action}>{segment.label}</FigureLabelLink>
      </span>
    );
  else text = <span className="min-w-0">{segment.label}</span>;
  const hint = segment.loading ? null : <FigureHint segment={segment} subLine={subLine} />;
  const Glyph = segment.icon;
  return (
    <dt className="type-body text-ink-2 flex min-w-0 items-center gap-2">
      {Glyph ? <Glyph aria-hidden className="size-4 shrink-0" /> : null}
      {text}
      {segment.marker || hint ? (
        <span className={cn('flex shrink-0 items-center gap-2', pressableLayer(segment))}>
          {segment.marker}
          {hint}
        </span>
      ) : null}
    </dt>
  );
}

/** Controls inside a pressable figure sit above its whole-cell button. */
function pressableLayer(segment: FigureSegment) {
  return segment.onSelect ? 'relative z-10' : undefined;
}

/**
 * Line 2: the value (or its absence) and its Delta on one baseline; a score's
 * number follows its ring. A figure whose label is hidden carries its hint here.
 */
function FigureValueLine({ segment, subLine }: FigurePart) {
  const delta = segment.loading || !reportsChange(segment.delta) ? null : segment.delta;
  return (
    <dd data-figure-value="" className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
      <FigureValue segment={segment} />
      {delta ? <span className="type-caption-strong shrink-0">{delta}</span> : null}
      {segment.labelHidden && !segment.loading ? (
        <span className="ms-auto shrink-0 self-center">
          <FigureHint segment={segment} subLine={subLine} />
        </span>
      ) : null}
    </dd>
  );
}

/**
 * Line 3 with `subLine`: the basis, one line. An empty one keeps its height so
 * the row's values align.
 */
function FigureSub({ segment }: FigurePart) {
  return (
    <dd className="type-caption text-ink-2 min-w-0 truncate">
      {/* A no-break space: a plain one collapses, and the line with it. */}
      {segment.sub && !segment.loading ? segment.sub : ' '}
    </dd>
  );
}

/** A Delta with nothing to compare prints nothing beside a value. */
function reportsChange(delta: ReactNode): boolean {
  if (delta == null || delta === false) return false;
  if (isValidElement<ComponentProps<typeof Delta>>(delta) && delta.type === Delta)
    return typeof delta.props.value === 'number' && Number.isFinite(delta.props.value);
  return true;
}

const VALUE_TEXT = 'type-heading text-ink tabular-nums';

function FigureValue({ segment }: FigurePart) {
  if (segment.loading)
    return (
      <span className="flex items-center self-center">
        <span className="sr-only">Loading</span>
        <Block className="h-4 w-16" />
      </span>
    );
  if (segment.score) {
    const { value, label, unit } = segment.score;
    return (
      <span className="flex min-w-0 items-center gap-2 self-center">
        <ScoreRing value={value} label={label} unit={unit} tone="auto" size="inline" />
        <span aria-hidden className={VALUE_TEXT}>
          {Math.max(0, Math.min(100, Math.round(value)))}
          {unit}
        </span>
      </span>
    );
  }
  const { value } = segment;
  // A formatter's absence word is an absence too, never printed as a value.
  if (value == null) {
    const state = absenceOf(segment.missingLabel) ?? 'not_measured';
    return <Absence state={state} label={segment.missingLabel} />;
  }
  const absent = absenceOf(value);
  if (absent) return <Absence state={absent} />;
  // Cut inside its cell; the whole value stays in the text and on hover.
  if (typeof value === 'string' || typeof value === 'number')
    return (
      <span className={cn(VALUE_TEXT, 'min-w-0 truncate')} title={String(value)}>
        {String(value)}
      </span>
    );
  return <div className={cn(VALUE_TEXT, 'flex min-w-0 items-center gap-2')}>{value}</div>;
}

/** The caption, basis (unless shown as a line) and comparison joined with " · " in one hint. */
function FigureHint({ segment, subLine }: FigurePart) {
  const parts = [
    { key: 'caption', node: segment.caption },
    { key: 'sub', node: subLine ? null : segment.sub },
    { key: 'comparison', node: comparisonText(segment) },
  ].filter((part) => Boolean(part.node));
  if (!parts.length) return null;
  const name = typeof segment.label === 'string' ? segment.label : segment.key;
  // "Basis of": a caller's marker or a card title may already hold an "About" hint.
  return (
    <InfoHint label={`Basis of ${name}`}>
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index ? ' · ' : null}
          {part.node}
        </Fragment>
      ))}
    </InfoHint>
  );
}

function comparisonText(segment: FigureSegment): ReactNode {
  const { comparison } = segment;
  if (!comparison) return null;
  return (
    <span data-figure-comparison="">
      {comparison.label}:{' '}
      <span className="tabular-nums">
        {comparison.value ?? segment.missingLabel ?? availabilityLabel('not_measured')}
      </span>
    </span>
  );
}

// No underline at rest, underlined on hover and focus (owner 2026-11-16), in the label's ink-2.
function FigureLabelLink({
  action,
  children,
}: Readonly<{ action: FigureLink; children: ReactNode }>) {
  if (action.onSelect)
    return (
      <TextLink asChild underline="hover" className="text-ink-2">
        <button type="button" className="text-start" onClick={action.onSelect}>
          {children}
        </button>
      </TextLink>
    );
  return (
    <TextLink
      href={action.href}
      projectId={action.projectId}
      underline="hover"
      className="text-ink-2"
    >
      {children}
    </TextLink>
  );
}
