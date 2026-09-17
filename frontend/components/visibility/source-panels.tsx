'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CursorTableFooter } from '@/components/ui/cursor-table-footer';
import { InfoHint } from '@/components/ui/info-hint';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { MetricGroup, MetricItem } from '@/components/ui/workspace';
import type { Visibility } from '@/lib/api/types';
import { setUrlParams } from '@/lib/navigation/url-state';
import { formatRate } from '@/lib/visibility/dashboard';
import type { SourceData, SourceType } from '@/lib/visibility/use-source-analysis';

/**
 * The three panels around the cited-domain table: what the selection cited,
 * the mix of site kinds, and the pager.
 *
 * Split out of `visibility-sources.tsx` so that file holds the composition and
 * the filter state rather than the composition, the state AND every panel it
 * draws. It was at 414 lines against a 500-line ceiling before the tab gained
 * a second half.
 */

/**
 * What the whole selection cited, as a sentence and the numbers behind it.
 *
 * The lede is a claim a reader can repeat — "cited by 96 sources" — with the
 * figures that support it beside it, rather than a row of bare tiles they have
 * to assemble into a sentence themselves.
 */
export function SourceTotals({
  data,
  domain,
  citations,
}: Readonly<{
  data?: SourceData;
  domain: string | null;
  citations?: Visibility['citation_totals'];
}>) {
  if (!data) return null;
  return (
    <div className="bg-surface border-border-subtle grid gap-4 rounded-[var(--radius-card)] border p-[var(--card-padding)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      {/* Each label names exactly what its number counts. `data.total` is
          distinct DOMAIN GROUPS on the current filter, `data.responses` is
          every analyzed answer (cited or not), and `citations.citations` is
          every citation in those answers including competitors' — the owned
          subset is the tile below. */}
      <p className={textRole('objectTitle')}>
        {domain
          ? `${data.total} ${data.total === 1 ? 'page' : 'pages'} cited on ${domain}`
          : `${data.total} ${data.total === 1 ? 'source' : 'sources'} cited across these answers`}
      </p>
      <MetricGroup className="lg:w-auto">
        <MetricItem
          label="Answers analyzed"
          value={String(data.responses)}
          detail={`across ${data.prompts} ${data.prompts === 1 ? 'prompt' : 'prompts'}`}
        />
        {citations ? (
          <MetricItem label="Citations in answers" value={String(citations.citations)} />
        ) : null}
        {citations ? (
          <MetricItem
            label="Citations to your site"
            value={String(citations.owned_citations)}
            detail={
              citations.owned_share == null ? null : `${formatRate(citations.owned_share)} of all`
            }
          />
        ) : null}
      </MetricGroup>
    </div>
  );
}

export function SourceTypes({
  types,
  selected,
}: Readonly<{ types: SourceType[]; selected: string | null }>) {
  if (!types.length) return null;
  return (
    <Card>
      <CardHeader className="grid gap-1">
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            Source types
            <InfoHint label="Source types">
              The kind of site each cited domain is. Independent editorial and review sites are the
              ones you cannot publish to directly.
            </InfoHint>
          </span>
        </CardTitle>
        <p className={textRole('meta', 'text-secondary')}>
          Across every cited domain in this selection, including types the table is filtered out of.
        </p>
      </CardHeader>
      <CardContent>
        <Stack gap="compact">
          {types.map((type) => (
            <div key={type.label} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className={textRole(type.token === selected ? 'bodyStrong' : 'body')}>
                  {type.label}
                  {type.token === selected ? ' · filtered' : ''}
                </span>
                <span className={textRole('metricSm')}>
                  {formatRate(type.share)}
                  <span className={textRole('meta', 'text-secondary ms-1.5')}>{type.domains}</span>
                </span>
              </div>
              <div className="bg-surface-2 h-1.5 w-full overflow-hidden rounded-full" aria-hidden>
                <div
                  className="bg-accent h-full rounded-full"
                  style={{ inlineSize: `${Math.max(2, type.share * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

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
  offset,
  pageSize,
  busy,
  onPageSizeChange,
}: Readonly<{
  data?: SourceData;
  domain: string | null;
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
      noun={domain ? 'pages' : 'domains'}
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
