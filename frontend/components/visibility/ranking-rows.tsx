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
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { Button } from '@/components/ui/button';
import type { RankingRow } from '@/lib/api/types';
import { formatRate } from '@/lib/visibility/dashboard';
import { changeLabel } from '@/lib/visibility/vocabulary';
import { TablePagination, useTablePage } from '@/components/ui/table-pagination';
import { textRole } from '@/components/ui/typography';
import { tagClasses } from '@/components/ui/filter-chip-variants';

/**
 * Where you stand against the brands you track.
 *
 * Two things used to make this table unreadable. Every row without a
 * comparable prior run printed the sentence "No comparable change" inside a
 * numeric cell, so a column of numbers became a column of wrapped prose; a
 * missing change is now an em dash, and the one sentence explaining why sits
 * above the table instead of in every row. And the last column held a
 * full-width button labelled "N brand-absent answers", which truncated
 * mid-word; it is a number under a plain heading now.
 */
/** Rows per page, matching the shared table footer used across the app. */
const PAGE_SIZE = 10;

export function RankingRowsTable({
  rows,
  onSelect,
}: Readonly<{
  rows: readonly RankingRow[];
  onSelect?: (name: string) => void;
}>) {
  const ordered = [...rows].sort(
    (a, b) => (b.mention_rate ?? -1) - (a.mention_rate ?? -1) || a.name.localeCompare(b.name),
  );
  const { page, setPage, pageCount, from, to } = useTablePage(ordered.length, PAGE_SIZE);
  if (!ordered.length) return <p>No measured responses in this selection.</p>;
  const paged = ordered.slice(from - 1, to);
  // With no prior run there is no change for ANY brand, and a column of
  // "No comparable change" told the reader nothing seven times over. The reason
  // is stated once above the table instead.
  const anyChange = ordered.some(
    (row) => (row.matched_visibility_delta ?? row.visibility_delta) != null,
  );
  // Runs measured before competitor offsets were persisted have no ranking to
  // show for anyone, so the column is omitted rather than filled with a
  // placeholder in every row.
  const anyPosition = ordered.some((row) => row.avg_position != null);
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand</TableHead>
            <TableHead numeric>Visibility</TableHead>
            {anyPosition ? <TableHead numeric>Position</TableHead> : null}
            {anyChange ? <TableHead numeric>Change</TableHead> : null}
            <TableHead numeric className="hidden md:table-cell">
              Share of voice
            </TableHead>
            <TableHead numeric className="hidden md:table-cell">
              Citations
            </TableHead>
            <TableHead numeric>Answers without you</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map((row) => {
            // A matched-subset delta is the same measurement taken over the cells
            // both runs share. Which one it is belongs to the note above the
            // table, not to a disclosure inside every cell.
            const change = changeLabel(row.matched_visibility_delta ?? row.visibility_delta);
            return (
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
                    {row.is_brand ? (
                      <span className={textRole('label', tagClasses())}>You</span>
                    ) : null}
                  </span>
                  <span className={textRole('meta', 'text-secondary md:hidden')}>
                    {formatRate(row.share_of_voice)} share of voice ·{' '}
                    {formatRate(row.citation_rate)} citations
                  </span>
                </TableCell>
                {/* The rate is the column. Printing its fraction under every
                  row turned a scannable column of percentages into two
                  stacked numbers per cell. */}
                <TableCell numeric>{formatRate(row.mention_rate)}</TableCell>
                {anyPosition ? (
                  <TableCell numeric>
                    {row.avg_position == null ? (
                      <UnavailableValue state="not_measured" />
                    ) : (
                      `#${row.avg_position.toFixed(1)}`
                    )}
                  </TableCell>
                ) : null}
                {anyChange ? (
                  <TableCell numeric>
                    {change ?? <UnavailableValue state="not_measured" />}
                  </TableCell>
                ) : null}
                <TableCell numeric className="hidden md:table-cell">
                  {formatRate(row.share_of_voice)}
                </TableCell>
                <TableCell numeric className="hidden md:table-cell">
                  {formatRate(row.citation_rate)}
                </TableCell>
                <TableCell numeric>
                  {row.is_brand || !onSelect ? (
                    <UnavailableValue state="not_applicable" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelect(row.name)}
                      aria-label={`Show the ${row.gap_count ?? 0} answers naming ${row.name} but not you`}
                    >
                      {row.gap_count ?? 0}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        pageCount={pageCount}
        from={from}
        to={to}
        total={ordered.length}
        noun="brands"
        onPageChange={setPage}
      />
    </>
  );
}
