import {
  Fragment,
  isValidElement,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

import { Delta } from '@/components/ui/delta';
import {
  cellWidth,
  FIGURE_MIN_WIDTH,
  figureRowSizes,
  useStripWidth,
} from '@/components/ui/figure-rows';
import { InfoHint } from '@/components/ui/info-hint';
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
    /** The absence's word. Defaults to "Not measured". */
    missingLabel?: string;
    loading?: boolean;
    /** A small mark at the end of the label line (series key, info hint). */
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
 * FigureStrip — key figures as metric cards on the ground, 16 apart; inside a
 * card they are cells with no edges (globals.css "r3 a2 figures"). Rows come
 * from `figureRows`. A card is two rows: the label with its marker and one
 * info hint (caption, basis and comparison joined with " · "), then the value
 * with its Delta at the card's foot, so a row's values share one baseline
 * when a label wraps; 84 tall. An icon tile sits centred at the left of both
 * rows. A score's ScoreRing does too, its label and Delta beside it (96);
 * under 240px the label takes the first row and the ring and Delta the second.
 * A score is only ever a ring, never a bar. A figure with `action` makes its
 * label the link.
 *
 * A figure with `onSelect` is pressable: the whole card is the target, named
 * by `actionLabel`; `selected` makes it a toggle (`aria-pressed`).
 *
 * `subLine` shows each figure's `sub` as a visible third row instead of in
 * its hint; every cell keeps the line, so values still share a baseline.
 */
export function FigureStrip({
  segments,
  label,
  testId,
  lead,
  subLine = false,
}: Readonly<{
  segments: readonly FigureSegment[];
  /** Accessible name for the group, when the section heading does not give one. */
  label?: string;
  testId?: string;
  lead?: ReactNode;
  subLine?: boolean;
}>) {
  const { ref, width } = useStripWidth<HTMLDivElement>();
  const sizes = figureRowSizes({
    count: segments.length,
    width,
    lead: segments.some((segment) => segment.score || segment.icon),
  });
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
              subLine={subLine}
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
  subLine,
  rowSize,
  narrow,
}: Readonly<{ segment: FigureSegment; subLine: boolean; rowSize: number; narrow: boolean }>) {
  const pressable = Boolean(segment.onSelect);
  let leadKind: 'score' | 'icon' | undefined;
  if (segment.score) leadKind = 'score';
  else if (segment.icon) leadKind = 'icon';
  const parts = (
    <>
      <FigureLabel segment={segment} subLine={subLine} />
      <FigureLead segment={segment} />
      <FigureValueLine segment={segment} subLine={subLine} />
      {subLine ? <FigureSub segment={segment} /> : null}
    </>
  );
  return (
    <div
      data-figure-cell=""
      data-row-size={rowSize}
      data-figure-kind={leadKind}
      // A narrow row's labels may take two lines, so every label in it reserves two.
      data-label-lines={narrow && !segment.labelHidden ? 2 : undefined}
      data-pressable={pressable || undefined}
      data-selected={segment.selected || undefined}
      // The cell's share of its row: `flex-basis` in globals.css reads `--row`.
      style={{ '--row': rowSize } as CSSProperties}
      className={cn('relative min-w-0', pressable && 'hover:overlay-hover active:overlay-pressed')}
    >
      {leadKind === 'score' ? (
        // The cell is the size container; its layout lives one level in.
        <div data-figure-score-body="">{parts}</div>
      ) : (
        parts
      )}
      {pressable ? (
        <button
          type="button"
          onClick={segment.onSelect}
          aria-label={segment.actionLabel}
          aria-pressed={segment.selected}
          className="focus-ring rounded-control absolute inset-0"
        />
      ) : null}
    </div>
  );
}

type FigurePart = Readonly<{ segment: FigureSegment; subLine?: boolean }>;

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

/** Row 1: the label (or its link), wrapping between words but never cut, then its marker and hint. */
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
  return (
    <dt className="type-body text-ink-2 mb-1 flex min-w-0 items-start justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 self-center">{text}</span>
      {segment.marker || hint ? (
        <span className={cn('flex shrink-0 items-center gap-2', pressableLayer(segment))}>
          {segment.marker}
          {hint}
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

/**
 * Row 2: the value (or its absence's word) and its Delta on one baseline; a
 * score's ring holds its value, so the row is its Delta alone. A figure whose
 * label is hidden carries its hint here.
 */
function FigureValueLine({ segment, subLine }: FigurePart) {
  const delta = segment.loading || !reportsChange(segment.delta) ? null : segment.delta;
  if (segment.score && !delta) return null;
  return (
    <dd
      data-figure-value=""
      className={cn(
        'flex min-w-0 items-baseline gap-2 whitespace-nowrap',
        !segment.score && 'min-h-[var(--text-figure--line-height)]',
      )}
    >
      {segment.score ? null : <FigureValue segment={segment} />}
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
 * Row 3 with `subLine`: the basis, one line. Grid auto-placement puts it under
 * the value; an empty one keeps its height so the row's values align.
 */
function FigureSub({ segment }: FigurePart) {
  return (
    <dd className="type-caption text-ink-2 min-w-0 truncate">
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

function FigureValue({ segment }: FigurePart) {
  const { value } = segment;
  if (segment.loading)
    return (
      <span className="flex min-h-[var(--text-figure--line-height)] items-center">
        <span className="sr-only">Loading</span>
        <Block className="h-6 w-16" />
      </span>
    );
  if (value == null)
    return (
      <Value text="figure" value={null} absentLabel={segment.missingLabel ?? 'Not measured'} />
    );
  if (typeof value === 'string' || typeof value === 'number')
    return <span className="type-figure text-ink tabular-nums">{String(value)}</span>;
  return <div className="type-figure text-ink min-w-0">{value}</div>;
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
        {comparison.value ?? segment.missingLabel ?? 'Not measured'}
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
        <button type="button" onClick={action.onSelect}>
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
