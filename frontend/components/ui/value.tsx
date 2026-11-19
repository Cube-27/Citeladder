import { Absence } from '@/components/ui/absence';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { type DataAvailabilityState, type Formatted, isAbsent } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Where a value is printed: a key figure, or a row's data. */
type ValueText = 'figure' | 'body';

/** The line box per text role, so a slot is one height in every state. */
const SLOT: Record<ValueText, string> = {
  figure: 'min-h-[var(--text-figure--line-height)]',
  body: 'min-h-[var(--text-body-sm--line-height)]',
};

export type ValueProps = Readonly<{
  /** The formatted value (from lib/format), or null when it is absent. */
  value: Formatted | null;
  /** Which absence a null value is. */
  absent?: DataAvailabilityState;
  /** The absence's word, when the state's own word is not the reader's. */
  absentLabel?: string;
  loading?: boolean;
  text?: ValueText;
  className?: string;
}>;

/**
 * Value — the single way to print a measured value:
 * tabular numerals at the role's size, or its Absence. Loading is
 * its own state, the live rung, never "not measured". Every state takes the
 * same line box, so nothing moves when the value arrives or reloads. Zero is
 * a value in full ink.
 */
export function Value({
  value,
  absent = 'not_measured',
  absentLabel,
  loading = false,
  text = 'body',
  className,
}: ValueProps) {
  const slot = cn('inline-flex items-center gap-1', SLOT[text], className);
  if (loading)
    return (
      <span className={slot}>
        <Spinner label="Loading" />
      </span>
    );
  if (value === null || isAbsent(value))
    return (
      <span className={slot}>
        <Absence state={value?.absent ?? absent} label={absentLabel} />
      </span>
    );
  return (
    <span className={slot}>
      <span className={textRole(text, 'whitespace-nowrap tabular-nums')}>{value}</span>
    </span>
  );
}
