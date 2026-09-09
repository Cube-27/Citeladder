'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import type { RankingRow } from '@/lib/api/types';
import { formatRate } from '@/lib/visibility/dashboard';
import { textRole } from '@/components/ui/typography';
import { tagClasses } from '@/components/ui/filter-chip-variants';

export function RankingRowsTable({
  rows,
  responses,
  onSelect,
}: Readonly<{
  rows: readonly RankingRow[];
  responses?: number;
  onSelect?: (name: string) => void;
}>) {
  const ordered = [...rows].sort(
    (a, b) => (b.mention_rate ?? -1) - (a.mention_rate ?? -1) || a.name.localeCompare(b.name),
  );
  if (!ordered.length) return <p>No measured responses in this selection.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Brand</TableHead>
          <TableHead numeric>Visibility</TableHead>
          <TableHead numeric>Change</TableHead>
          <TableHead numeric className="hidden md:table-cell">
            SOV
          </TableHead>
          <TableHead numeric className="hidden md:table-cell">
            Citation rate
          </TableHead>
          <TableHead>Evidence</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordered.map((row) => (
          <TableRow key={`${row.is_brand}-${row.name}`} highlight={row.is_brand}>
            <TableCell>
              <span className="flex items-center gap-2">
                <BrandLogo
                  name={row.name}
                  logoUrl={row.logo_url}
                  websiteUrl={row.website_url}
                  size="sm"
                />
                <span className={textRole('emphasis')}>{row.name}</span>
                {row.is_brand ? <span className={textRole('label', tagClasses())}>You</span> : null}
              </span>
              <details className="md:hidden">
                <summary className="focus-ring cursor-pointer">More measurements</summary>
                <p>SOV: {formatRate(row.share_of_voice)}</p>
                <p>Citation rate: {formatRate(row.citation_rate)}</p>
              </details>
            </TableCell>
            <TableCell numeric>
              {formatRate(row.mention_rate)}
              <p className={textRole('meta', 'text-secondary')}>
                {responses === undefined
                  ? 'Sample unavailable'
                  : `${row.mention_count} of ${responses} responses`}
              </p>
            </TableCell>
            <TableCell numeric>
              {row.matched_visibility_delta != null ? (
                <details>
                  <summary className="focus-ring cursor-pointer">Matched subset</summary>
                  <p>{formatChange(row.matched_visibility_delta)}</p>
                  <p>
                    {formatRate(row.matched_visibility_rate ?? null)} · {row.matched_response_count}{' '}
                    matched responses
                  </p>
                </details>
              ) : (
                formatChange(row.visibility_delta)
              )}
            </TableCell>
            <TableCell numeric className="hidden md:table-cell">
              {formatRate(row.share_of_voice)}
            </TableCell>
            <TableCell numeric className="hidden md:table-cell">
              {formatRate(row.citation_rate)}
            </TableCell>
            <TableCell>
              {!row.is_brand && onSelect ? (
                <Button variant="ghost" size="sm" onClick={() => onSelect(row.name)}>
                  {row.gap_count ?? 'View'} brand-absent answers
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'No comparable change';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pp`;
}
