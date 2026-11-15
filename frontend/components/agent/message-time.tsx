import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayTimestamp } from '@/lib/format';

/** A message's time in the app's one date-time format, with its zone. */
export function MessageTime({ value }: Readonly<{ value: string }>) {
  const timeZone = useDisplayTimeZone();
  return <time dateTime={value}>{formatDisplayTimestamp(value, timeZone)}</time>;
}
