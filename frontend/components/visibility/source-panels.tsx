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
  if (!data) return null;
  const total = data.total;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(total, offset + data.items.length);
  return (
    <CursorTableFooter
      from={from}
      to={to}
      total={total}
      noun={dimension === 'url' || domain ? 'URLs' : 'domains'}
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      canPrev={offset > 0}
      canNext={data.next_offset !== null}
      busy={busy}
      onPrev={() => {
        const nextOffset = Math.max(0, offset - pageSize);
        setUrlParams({
          source_offset: nextOffset ? String(nextOffset) : null,
          source_as_of: nextOffset ? (data.as_of ?? null) : null,
        });
      }}
      onNext={() => {
        if (data.next_offset === null) return;
        setUrlParams({
          source_offset: String(data.next_offset),
          source_as_of: data.as_of ?? null,
        });
      }}
    />
  );
}
