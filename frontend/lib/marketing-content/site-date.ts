const dateParts = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Every website date: `2026-11-07` (or a full timestamp) → `7 Nov 2026`.
 * Assembled from parts because en-GB spells September "Sept".
 */
export function formatSiteDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const parts = dateParts.formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('day')} ${part('month')} ${part('year')}`;
}
