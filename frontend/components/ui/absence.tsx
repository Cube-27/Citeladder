import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import {
  ABSENCE_MARK,
  availabilityLabel,
  type DataAvailabilityState,
  type Formatted,
  isAbsent,
} from '@/lib/format';
import { cn } from '@/lib/utils';

type AbsenceProps = Readonly<
  Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
    state?: DataAvailabilityState;
    reason?: string;
    label?: string;
    body?: boolean;
  }
>;

export function printed(value: Formatted): ReactNode {
  return isAbsent(value) ? <Absence state={value.absent} /> : value;
}

export function Absence({
  state = 'not_measured',
  reason,
  label,
  body = false,
  className,
  ...props
}: AbsenceProps) {
  const word = label ?? availabilityLabel(state);
  const face = (
    <span
      {...props}
      data-absence={state}
      title={reason ? undefined : word}
      className={cn('text-ink-2 font-plain whitespace-nowrap', body && 'text-body', className)}
    >
      <span aria-hidden>{ABSENCE_MARK}</span>
      <span className="sr-only">{word}</span>
    </span>
  );
  if (!reason) return face;
  return (
    <Tooltip content={reason} reach="tap">
      <button
        type="button"
        className="rounded-mark hit-area inline-flex min-h-6 min-w-6 items-center justify-center align-middle"
      >
        {face}
      </button>
    </Tooltip>
  );
}
