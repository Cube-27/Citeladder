import type { ReactNode } from 'react';

import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate, formatDisplayTimestamp } from '@/lib/format';

/**
 * A persisted instant in the display timezone. Inside a sentence it keeps the
 * sentence's face; a date that stands alone as a value (a fact, a cell, a
 * range) passes `standalone` and takes the mono data face.
 */
export function DisplayTime({
  value,
  dateOnly = false,
  standalone = false,
  fallback = null,
}: Readonly<{
  value: string | null | undefined;
  dateOnly?: boolean;
  standalone?: boolean;
  fallback?: ReactNode;
}>) {
  const timeZone = useDisplayTimeZone();
  if (!value) return fallback;
  return (
    <time dateTime={value} className={standalone ? 'type-data' : undefined}>
      {dateOnly ? formatDisplayDate(value, timeZone) : formatDisplayTimestamp(value, timeZone)}
    </time>
  );
}
