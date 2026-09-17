'use client';

import { FilterChip } from '@/components/ui/filter-chip';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { Button } from '@/components/ui/button';
import { textRole } from '@/components/ui/typography';
import type { SourceData } from '@/lib/visibility/use-source-analysis';

/**
 * The sites the models drew on, above the answers themselves.
 *
 * This tab used to open on a table of domains whose rows opened a table of
 * pages whose rows opened the evidence: four interactions to reach one quoted
 * line. The evidence is the default now, and this band is what keeps the
 * rollup visible without putting it back in the way — a reader sees which
 * sites were cited and can narrow to one, or open the full table, but never
 * has to do either to read an answer.
 */
export function CitedSourcesStrip({
  data,
  activeDomain,
  onSelectDomain,
  onOpenTable,
}: Readonly<{
  data?: SourceData;
  activeDomain: string | null;
  onSelectDomain: (domain: string | null) => void;
  onOpenTable: () => void;
}>) {
  const rows = data?.items ?? [];
  if (!rows.length) return null;
  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={eyebrowClasses}>Sites cited in these answers</p>
        <Button variant="ghost" size="sm" onClick={onOpenTable}>
          See all {data?.total ?? rows.length} sources
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {activeDomain && !rows.some((row) => row.key === activeDomain) ? (
          // A domain reached from a page row may not be in the top few. It is
          // still the filter in force, so it is shown rather than leaving the
          // band looking as though nothing is narrowed.
          <FilterChip active onClick={() => onSelectDomain(null)}>
            {activeDomain}
          </FilterChip>
        ) : null}
        {rows.map((row) => (
          <FilterChip
            key={row.key}
            active={row.key === activeDomain}
            count={row.responses}
            onClick={() => onSelectDomain(row.key === activeDomain ? null : row.key)}
          >
            {row.key || 'Domain unavailable'}
          </FilterChip>
        ))}
      </div>
      <p className={textRole('meta')}>
        Each count is the answers that cited that site. Selecting one narrows the answers below.
      </p>
    </section>
  );
}
