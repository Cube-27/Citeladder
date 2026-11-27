import { Absence } from '@/components/ui/absence';
import { Spinner } from '@/components/ui/spinner';
import { TEXT_ROLE_CLASS } from '@/components/ui/text-role';
import { type DataAvailabilityState, type Formatted, isAbsent } from '@/lib/format';
import { cn } from '@/lib/utils';

type ValueText = 'figure' | 'body';

const SLOT: Record<ValueText, string> = {
  figure: 'min-h-figure-line',
  body: 'min-h-body-line',
};

export type ValueProps = Readonly<{
  value: Formatted | null;
  absent?: DataAvailabilityState;
  absentLabel?: string;
  loading?: boolean;
  text?: ValueText;
  className?: string;
}>;

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
      <span className={cn(TEXT_ROLE_CLASS[text], 'whitespace-nowrap tabular-nums')}>{value}</span>
    </span>
  );
}
