import { AppGrid } from '@/components/ui/app-grid';
import { Tag } from '@/components/ui/tag';
import { FactList } from '@/components/ui/facts';
import { TextLink } from '@/components/ui/text-link';
import { Label, textRole } from '@/components/ui/typography';
import type { PageDetail } from '@citeladder/contracts';
import { Inline, Stack } from '@/components/ui/layout';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { StateBlock } from '@/components/ui/state-block';
import { formatCount, formatPercent, pluralCount } from '@/lib/format';
import { ClampText } from '@/components/ui/clamp-text';

/**
 * Internal links — the crawl's persisted link-graph projection for this page.
 *
 * Two numbers that look alike and are not: `Inbound` counts every internal
 * link, navigation included; `Main-content inbound` counts only the ones the
 * DOM placed inside the page's primary region. A page with a large first number
 * and a zero second one is in the menu and nowhere else. `Depth from home` is
 * shortest path over all followable links, because a nav link is a real click.
 *
 * The caller distinguishes absent crawl measurements from an observed zero.
 */
export function InternalLinksCard({
  links,
  crawlId,
}: Readonly<{ links: NonNullable<PageDetail['internal_links']>; crawlId: string }>) {
  const diagnosticCounts = {
    generic: links.anchor_diagnostics.filter((item) => item.kind === 'generic').length,
    repeated_destination: links.anchor_diagnostics.filter(
      (item) => item.kind === 'repeated_destination',
    ).length,
    low_lexical_alignment: links.anchor_diagnostics.filter(
      (item) => item.kind === 'low_lexical_alignment',
    ).length,
  };
  const metrics = [
    { label: 'Inbound', value: formatCount(links.inbound_count) },
    { label: 'Main-content inbound', value: formatCount(links.main_content_inbound_count) },
    { label: 'Outbound', value: formatCount(links.outbound_count) },
    { label: 'Main-content outbound', value: formatCount(links.main_content_outbound_count) },
    { label: 'Nofollow inbound', value: formatCount(links.nofollow_inbound_count) },
    {
      label: 'Internal authority',
      value: formatPercent(links.authority_share),
    },
    { label: 'Authority rank', value: formatCount(links.authority_rank) },
    { label: 'Generic anchor patterns', value: formatCount(diagnosticCounts.generic) },
    {
      label: 'Repeated destination patterns',
      value: formatCount(diagnosticCounts.repeated_destination),
    },
    {
      label: 'Low lexical alignment',
      value: formatCount(diagnosticCounts.low_lexical_alignment),
    },
    {
      label: 'Depth from home',
      // Null is a measurement: no observed link path reaches this page from the home page.
      value:
        links.depth_from_home === null
          ? 'Not reached from home'
          : formatCount(links.depth_from_home),
    },
  ];
  return (
    <Stack gap="workspace" className="min-w-0">
      <p className={textRole('caption')}>
        {`${pluralCount(links.source_page_count, 'page')} crawled${links.observed_crawl_incomplete ? ' · incomplete or sampled crawl' : ''}`}
      </p>
      <FactList layout="ruled" label="Internal link measurements" facts={metrics} />
      <AppGrid layout="halves">
        <NeighbourList
          heading="Top linking pages"
          neighbours={links.top_inbound}
          crawlId={crawlId}
          emptyMessage="No crawled page links here."
        />
        <NeighbourList
          heading="Top linked pages"
          neighbours={links.top_outbound}
          crawlId={crawlId}
          emptyMessage="This page links to no other crawled page."
        />
      </AppGrid>
    </Stack>
  );
}

function NeighbourList({
  heading,
  neighbours,
  crawlId,
  emptyMessage,
}: Readonly<{
  heading: string;
  neighbours: NonNullable<PageDetail['internal_links']>['top_inbound'];
  crawlId: string;
  emptyMessage: string;
}>) {
  return (
    <Stack as="section" gap="item" className="min-w-0 content-start overflow-hidden">
      <Label>{heading}</Label>
      {neighbours.length === 0 ? (
        <StateBlock kind="empty" inline message={emptyMessage} />
      ) : (
        <ul className={ledgerClasses()}>
          {neighbours.map((neighbour) => (
            <Inline
              as="li"
              gap="compact"
              key={`${neighbour.site_url_id ?? neighbour.url}`}
              className={ledgerItemClasses('items-start justify-between')}
            >
              {/* An off-crawl target is counted but was never a node, so it has
                  no detail route to link to. */}
              {neighbour.site_url_id ? (
                <TextLink
                  text="caption"
                  className="min-w-0 truncate"
                  href={`/site/crawls/${crawlId}/pages/${neighbour.site_url_id}`}
                  title={neighbour.url}
                >
                  {neighbour.url}
                </TextLink>
              ) : (
                <ClampText className="type-caption">{neighbour.url}</ClampText>
              )}
              <Inline as="span" className="shrink-0">
                {neighbour.main_content ? <Tag>Main</Tag> : null}
                {neighbour.nofollow ? <Tag>Nofollow</Tag> : null}
                <span className="type-caption tabular-nums">×{neighbour.anchor_count}</span>
              </Inline>
            </Inline>
          ))}
        </ul>
      )}
    </Stack>
  );
}
