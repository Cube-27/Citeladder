import { Absence } from '@/components/ui/absence';
import { searchAmount, searchNumber } from './search-intelligence-format';

/**
 * One provider figure, priced when it carries a `currency`. A dataset that was
 * never fetched says so in words, because fetching it is the reader's next
 * step; a figure the provider did not report is the shared missing mark, never
 * a zero.
 */
export function SearchValue({
  value,
  fetched = true,
  digits = 0,
  currency,
}: Readonly<{ value: unknown; fetched?: boolean; digits?: number; currency?: string | null }>) {
  if (!fetched) return <Absence state="not_run" label="Not fetched" />;
  const text = currency === undefined ? searchNumber(value, digits) : searchAmount(value, currency);
  return text === null ? <Absence /> : <>{text}</>;
}
