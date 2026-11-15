import type { ReactNode } from 'react';

import { TableCellLines } from '@/components/ui/table';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate, formatDisplayTime, formatDisplayTimestamp } from '@/lib/format';

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

/**
 * A date-time in a table's date column: the date over its time and zone. On
 * one line ("Nov 1, 2026, 05:03 PM GMT+5:30") it is wider than the column and
 * ran into the next one.
 */
export function TableTime({
  value,
  fallback = null,
}: Readonly<{ value: string | null | undefined; fallback?: ReactNode }>) {
  const timeZone = useDisplayTimeZone();
  if (!value) return fallback;
  return (
    <time dateTime={value} className="block min-w-0">
      <TableCellLines
        primary={<span className="type-data">{formatDisplayDate(value, timeZone)}</span>}
        secondary={formatDisplayTime(value, timeZone)}
      />
    </time>
  );
}
