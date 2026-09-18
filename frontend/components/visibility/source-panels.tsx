'use client';

import { CursorTableFooter } from '@/components/ui/cursor-table-footer';
import { setUrlParams } from '@/lib/navigation/url-state';
import type { SourcesData } from '@/lib/visibility/sources';

/**
 * The shared table footer, driven by the endpoint's offsets.
 *
 * The endpoint pages by offset rather than page number, so the page index is
 * derived from it. Using the app's one pagination control keeps this table
 * behaving like every other table in the product instead of growing its own
 * pair of buttons.
 */
export function SourcePaging({
  data,
  domain,
  dimension,
  offset,
  pageSize,
  busy,
  onPageSizeChange,
}: Readonly<{
  data?: SourcesData;
  domain: string | null;
  dimension: 'domain' | 'url';
  offset: number;
  pageSize: number;
  busy: boolean;
  onPageSizeChange: (value: number) => void;
}>) {
  // The footer stays MOUNTED with no data. Unmounting it took the rows-per-page
  // control and the pager off the screen for the duration of every load, which
  // shortened the card by the height of the whole bar and moved everything
  // under it -- twice per interaction, once out and once back.
  const total = data?.total ?? 0;
  const from = !data || total === 0 ? 0 : offset + 1;
  const to = data ? Math.min(total, offset + data.items.length) : 0;
  return (
    <CursorTableFooter
      from={from}
      to={to}
      total={data ? total : undefined}
      noun={dimension === 'url' || domain ? 'URLs' : 'domains'}
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      canPrev={Boolean(data) && offset > 0}
      canNext={data?.next_offset != null}
      busy={busy}
      onPrev={() => {
        if (!data) return;
        const nextOffset = Math.max(0, offset - pageSize);
        setUrlParams({
          source_offset: nextOffset ? String(nextOffset) : null,
          source_as_of: nextOffset ? (data.as_of ?? null) : null,
        });
      }}
      onNext={() => {
        if (data?.next_offset == null) return;
        setUrlParams({
          source_offset: String(data.next_offset),
          source_as_of: data.as_of ?? null,
        });
      }}
    />
  );
}
