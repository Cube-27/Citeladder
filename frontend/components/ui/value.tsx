import type { ReactNode } from 'react';

import { Absence } from '@/components/ui/absence';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import type { DataAvailabilityState } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Where a value is printed: a key figure, or a row's data. */
type ValueText = 'figureXl' | 'figure' | 'data';

/** The line box per text role, so a slot is one height in every state. */
const SLOT: Record<ValueText, string> = {
  figureXl: 'min-h-[var(--text-figure-xl--line-height)]',
  figure: 'min-h-[var(--text-figure--line-height)]',
  data: 'min-h-[var(--text-data--line-height)]',
};

export type ValueProps = Readonly<{
  /** The formatted value (from lib/format), or null when it is absent. */
  value: string | null;
  /** Which absence a null value is. */
  absent?: DataAvailabilityState;
  /** The absence's word, when the state's own word is not the reader's. */
  absentLabel?: string;
  /** Why it is absent, when the column cannot say it. */
  reason?: string;
  /** A narrow cell: the absence is an en dash, its word in a tooltip. */
  narrow?: boolean;
  /** The unit after the numeral ("pt", "ms"), in `ink-2`. */
  unit?: string;
  /** Stale: the date the value was last measured; the value turns `ink-2`. */
  asOf?: string;
  /** Sources disagree: the value carries a `≠` in the warning tone. */
  conflicting?: boolean;
  loading?: boolean;
  text?: ValueText;
  /** A trailing mark that belongs to the value (a Delta beside a figure). */
  after?: ReactNode;
  className?: string;
}>;

/**
 * Value — the single way to print a measured value:
 * tabular numerals at the role's size with the unit, or its Absence. Loading is
 * its own state, the live rung, never "not measured". Every state takes the
 * same line box, so nothing moves when the value arrives or reloads. Zero is
 * a value in full ink.
 */
export function Value({
  value,
  absent = 'not_measured',
  absentLabel,
  reason,
  narrow = false,
  unit,
  asOf,
  conflicting = false,
  loading = false,
  text = 'data',
  after,
  className,
}: ValueProps) {
  const slot = cn('inline-flex items-center gap-1', SLOT[text], className);
  if (loading)
    return (
      <span className={slot}>
        <Spinner label="Loading" />
      </span>
    );
  if (value === null)
    return (
      <span className={slot}>
        <Absence state={absent} label={absentLabel} reason={reason} narrow={narrow} />
      </span>
    );
  return (
    <span className={slot}>
      <span className={textRole(text, cn('whitespace-nowrap tabular-nums', asOf && 'text-ink-2'))}>
        {value}
        {unit ? <span className="text-ink-2">{` ${unit}`}</span> : null}
      </span>
      {conflicting ? (
        <span className="type-data-sm text-warning" title="Sources disagree">
          <span aria-hidden>≠</span>
          <span className="sr-only">Sources disagree</span>
        </span>
      ) : null}
      {asOf ? <span className="type-caption">{`as of ${asOf}`}</span> : null}
      {after}
    </span>
  );
}
