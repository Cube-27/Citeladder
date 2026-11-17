import type { ReactNode } from 'react';

import { ClampText } from '@/components/ui/clamp-text';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses } from '@/components/ui/workspace';
import { cn } from '@/lib/utils';

/** One label and the value it names. `key` defaults to the label when that is text. */
export type Fact = Readonly<{
  label: ReactNode;
  value: ReactNode;
  key?: string;
  /** `record` only: a caption under the value (its coverage). */
  note?: ReactNode;
  /** `record` only: a quiet link at the row's end (the value's source). */
  end?: ReactNode;
}>;

/**
 * How a list of facts lays out — a role, never a gap:
 *
 *   `ruled`  — the system's FactList, for detail panes: a grid inside a card,
 *              rows ruled only when there are more than four, the labels in a
 *              fixed 160px `ink-2` column so every value starts at the same
 *              edge; values stay on one line (the whole value in a tooltip),
 *              and in a narrow card the value moves under its label.
 *   `inline` — a record's summary facts on one wrapping line, each label
 *              beside its value (an Action's status, priority and target).
 *   `spread` — a short ledger read down the page, each label at the start and
 *              its value at the end (a quote's lines, an Action's evidence
 *              sources); `total` closes it under a rule.
 *   `columns` — a record's live status: one equal column per fact, the label
 *              over a one-line value at the badge height, so a value that
 *              changes (a sync's progress, a test result) swaps in place and
 *              never wraps or resizes the row. Long values truncate.
 *   `record` — a record's metrics in a drawer: every row ruled, 40 high (56
 *              with a note under the value), the name in `ink` over 40% and
 *              the value after it, with the row's source link at its end.
 */
export type FactLayout = 'ruled' | 'inline' | 'spread' | 'columns' | 'record';

const LIST = {
  // In the app rows are ruled only past four (`data-ruled`); the website rules every row.
  ruled: 'divide-rule grid divide-y [:root:not([data-public-surface])_&]:not-data-ruled:divide-y-0',
  inline: 'flex flex-wrap items-center gap-x-6 gap-y-3',
  spread: 'grid gap-2',
  columns: 'grid gap-3 desktop:grid-flow-col desktop:auto-cols-fr',
  record: 'divide-rule grid min-w-0 divide-y',
} as const;

const ROW = {
  // A fixed 160px label column, so every value starts at the same edge.
  ruled:
    'grid min-h-[var(--table-row-height)] grid-cols-[160px_minmax(0,1fr)] items-center gap-x-4 py-2',
  // A row never outgrows the list, so a long value cuts instead of scrolling the page.
  inline: 'flex min-w-0 max-w-full items-center gap-2',
  spread: 'flex flex-wrap items-center justify-between gap-x-4 gap-y-1',
  columns: 'grid min-w-0 gap-1',
  record:
    'grid min-h-10 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-x-3 py-2 has-[[data-fact-note]]:min-h-14',
} as const;

const TERM = {
  ruled: 'text-body-sm text-ink-2',
  inline: textRole('body', 'text-ink-2 shrink-0'),
  spread: textRole('body', 'text-ink-2'),
  columns: textRole('body', 'text-ink-2'),
  record: textRole('body', 'text-ink min-w-0'),
} as const;

const DETAIL = {
  ruled: 'text-body-sm text-ink min-w-0 tabular-nums',
  inline: textRole('body', 'text-ink-2 min-w-0'),
  // A spread row's value is a right-aligned amount or count (a quote line),
  // so its tabular digits line up with the total under it.
  spread: textRole('body', 'text-ink tabular-nums'),
  columns: textRole(
    'caption',
    'flex min-h-[var(--tag-height)] min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap tabular-nums',
  ),
  record: 'flex min-w-0 items-center justify-between gap-3',
} as const;

/** A ruled list draws lines between its rows only past this many (app). */
const RULED_FROM = 4;

/**
 * Where a value stays on one line, cut with its whole text reachable. The
 * website's ruled lists keep wrapping their values as before.
 */
const ONE_LINE: Record<FactLayout, string | null> = {
  ruled:
    '[[data-public-surface]_&]:overflow-visible [[data-public-surface]_&]:whitespace-normal [[data-public-surface]_&]:[overflow-wrap:anywhere]',
  inline: 'min-w-0 truncate',
  spread: null,
  columns: 'min-w-0',
  record: null,
};

function factKey(fact: Fact, index: number) {
  if (fact.key) return fact.key;
  return typeof fact.label === 'string' ? fact.label : String(index);
}

export function FactList({
  facts,
  layout,
  total,
  label,
}: Readonly<{
  facts: readonly Fact[];
  layout: FactLayout;
  /** `spread` only: the closing line (a quote's total), under a rule. */
  total?: Fact;
  /** Names the list when nothing visible does. */
  label?: string;
}>) {
  return (
    <dl
      aria-label={label}
      data-fact-list={layout}
      data-ruled={facts.length > RULED_FROM || undefined}
      // A grid or flex item's automatic minimum is its content's width, so a
      // long one-line value (a URL) would widen the list past its column.
      className={cn('min-w-0', LIST[layout])}
    >
      {facts.map((fact, index) => (
        <div key={factKey(fact, index)} className={ROW[layout]}>
          <dt className={TERM[layout]}>{fact.label}</dt>
          <dd className={DETAIL[layout]}>
            <FactValue fact={fact} layout={layout} />
          </dd>
        </div>
      ))}
      {total && layout === 'spread' ? (
        <div className={cn(ROW.spread, 'border-rule border-t pt-2')}>
          <dt className={textRole('emphasis')}>{total.label}</dt>
          <dd className={textRole('emphasis', 'tabular-nums')}>{total.value}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function FactValue({ fact, layout }: Readonly<{ fact: Fact; layout: FactLayout }>) {
  if (layout === 'record') return <RecordValue fact={fact} />;
  const oneLine = ONE_LINE[layout];
  return oneLine ? <ClampText className={oneLine}>{fact.value}</ClampText> : fact.value;
}

/** A record row's value (body `ink`, tabular), its note under it, and its link at the end. */
function RecordValue({ fact }: Readonly<{ fact: Fact }>) {
  return (
    <>
      <span className="min-w-0">
        <span className={textRole('body', 'text-ink block tabular-nums')}>{fact.value}</span>
        {fact.note ? (
          <span data-fact-note="" className={textRole('caption', 'block')}>
            {fact.note}
          </span>
        ) : null}
      </span>
      {fact.end ? (
        <span className={textRole('body', 'shrink-0 text-right')}>{fact.end}</span>
      ) : null}
    </>
  );
}

/**
 * A ranked list of label/value rows at one row height, padded with empty rows
 * to `rows`, so a short list keeps the height of a full one and cards that
 * sit side by side end on one line.
 */
export function ValueLedger({
  items,
  rows,
}: Readonly<{
  items: ReadonlyArray<Readonly<{ key: string; label: ReactNode; value: ReactNode }>>;
  rows: number;
}>) {
  // Each empty slot is named by the row it fills, so it keeps its identity
  // while the list above it grows or shrinks.
  const padding = Array.from(
    { length: Math.max(0, rows - items.length) },
    (_, offset) => `slot-${items.length + offset}`,
  );
  return (
    <ol className={ledgerClasses()}>
      {items.map((item) => (
        <li
          key={item.key}
          className="flex min-h-[var(--control-md)] items-center justify-between gap-2"
        >
          {/* The row's name is read first (primary ink); its value supports it. */}
          <ClampText className={textRole('body', 'flex-1')}>{item.label}</ClampText>
          <span className={textRole('body', 'text-ink-2 shrink-0 tabular-nums')}>{item.value}</span>
        </li>
      ))}
      {padding.map((slot) => (
        <li key={slot} aria-hidden className="h-[var(--control-md)]" />
      ))}
    </ol>
  );
}
