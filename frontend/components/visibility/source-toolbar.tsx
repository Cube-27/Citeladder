'use client';

import type { ReactNode } from 'react';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { SearchField } from '@/components/ui/search-field';
import { downloadCsv } from '@/lib/csv/download';
import { typeLabel, type SourceItem } from '@/lib/visibility/sources';

const DOMAIN_HEADERS = [
  'Domain',
  'Domain type',
  'Retrieved',
  'Retrieval rate',
  'Citations',
  'Citation share',
  'Citation rate',
] as const;

const URL_HEADERS = [
  'URL',
  'Page title',
  'URL type',
  'Retrievals',
  'Citation rate',
  'Citations',
  'Mentions',
  'Mentioned',
  'Last seen',
] as const;

/**
 * Search, the type filter and export, above whichever table is showing.
 *
 * Export writes the rows AS SHOWN — after the filter, the search and the sort.
 * Widening it to the unfiltered set would hand back a different answer from the
 * one on screen, and a reader who had narrowed to one type would have no way to
 * tell until they opened the file.
 */
export function SourceTableToolbar({
  dimension,
  search,
  onSearch,
  rows,
  domain,
  typeControl,
}: Readonly<{
  dimension: 'domain' | 'url';
  search: string;
  onSearch: (value: string) => void;
  rows: readonly SourceItem[];
  domain: string | null;
  typeControl: ReactNode;
}>) {
  const onExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = domain ? `${domain}-` : '';
    if (dimension === 'url') {
      downloadCsv(
        `citeladder-sources-${scope}urls-${stamp}`,
        URL_HEADERS,
        rows.map((row) => [
          row.key,
          row.title ?? '',
          typeLabel(row.page_format, 'url') ?? '',
          row.responses,
          row.citation_rate,
          row.annotations,
          row.mentions,
          row.brands.map((brand) => brand.name).join(' | '),
          row.last_cited_at ?? '',
        ]),
      );
      return;
    }
    downloadCsv(
      `citeladder-sources-domains-${stamp}`,
      DOMAIN_HEADERS,
      rows.map((row) => [
        row.key,
        typeLabel(row.categories.length === 1 ? row.categories[0] : null, 'domain') ?? '',
        row.response_rate,
        row.retrieval_rate,
        row.annotations,
        row.citation_share,
        row.citation_rate,
      ]),
    );
  };

  return (
    <CardHeader className="flex-row flex-wrap items-center gap-2">
      {typeControl}
      <div className="ml-auto flex items-center gap-2">
        <SearchField
          value={search}
          onValueChange={onSearch}
          onClear={() => onSearch('')}
          placeholder="Search"
          aria-label={dimension === 'url' ? 'Search URLs' : 'Search domains'}
          className="w-full sm:w-56"
        />
        <Button variant="secondary" size="sm" onClick={onExport} disabled={rows.length === 0}>
          <Download className="size-4" aria-hidden />
          Export
        </Button>
      </div>
    </CardHeader>
  );
}
