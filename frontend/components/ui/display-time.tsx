import type { ReactNode } from 'react';

import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate, formatDisplayTimestamp, formatTimeZoneNote } from '@/lib/format';

/**
 * A persisted instant in the display timezone, without its zone: the table
 * or page it sits in states the zone once (`TimeZoneNote`). Inside a sentence
 * it keeps the sentence's face; a date that stands alone as a value (a fact,
 * a cell, a range) passes `standalone` for tabular numerals.
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
    <time dateTime={value} className={standalone ? 'tabular-nums' : undefined}>
      {dateOnly ? formatDisplayDate(value, timeZone) : formatDisplayTimestamp(value, timeZone)}
    </time>
  );
}

/**
 * The zone a table's or page's date-times are in, said once ("Times in
 * GMT+5:30"), for a DataTable's `footer` or under a page's facts.
 */
export function TimeZoneNote() {
  const timeZone = useDisplayTimeZone();
  return <span className="type-caption">{formatTimeZoneNote(timeZone)}</span>;
}
