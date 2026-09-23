import { ProjectLink } from '@/components/layout/scoped-link';

import { Badge } from '@/components/ui/badge';
import { Label, textRole } from '@/components/ui/typography';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import type { PageDetail } from '@/lib/api/types';
import { PLACEHOLDER } from '@/lib/site-health/status';
import { ledgerClasses } from '@/components/ui/workspace';

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
    { label: 'Inbound', value: links.inbound_count },
    { label: 'Main-content inbound', value: links.main_content_inbound_count },
    { label: 'Outbound', value: links.outbound_count },
    { label: 'Main-content outbound', value: links.main_content_outbound_count },
    { label: 'Nofollow inbound', value: links.nofollow_inbound_count },
    {
      label: 'Internal authority',
      value: `${(links.authority_share * 100).toFixed(2)}%`,
    },
    { label: 'Authority rank', value: links.authority_rank },
    { label: 'Generic anchor patterns', value: diagnosticCounts.generic },
    {
      label: 'Repeated destination patterns',
      value: diagnosticCounts.repeated_destination,
    },
    {
      label: 'Low lexical alignment',
      value: diagnosticCounts.low_lexical_alignment,
    },
    {
      label: 'Depth from home',
      value: links.depth_from_home === null ? PLACEHOLDER : links.depth_from_home,
    },
  ];
  return (
    <div className="grid min-w-0 gap-4">
      <p className={textRole('meta', 'max-[980px]:hidden')}>
        {`Modelled over ${links.source_page_count} observed crawl page${links.source_page_count === 1 ? '' : 's'}${links.observed_crawl_incomplete ? '; this crawl is incomplete or sampled' : ''}`}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="grid gap-0.5">
            <Label>{metric.label}</Label>
            <dd className={textRole('bodyStrong', 'mono')}>
              {metric.value === PLACEHOLDER ? (
                <UnavailableValue state="not_measured" />
              ) : (
                metric.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
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
      </div>
    </div>
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
    <section className="grid min-w-0 content-start gap-1.5 overflow-hidden">
      <Label>{heading}</Label>
      {neighbours.length === 0 ? (
        <p className={textRole('body')}>{emptyMessage}</p>
      ) : (
        <ul className={ledgerClasses()}>
          {neighbours.map((neighbour) => (
            <li
              key={`${neighbour.site_url_id ?? neighbour.url}`}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-1.5 first:pt-0"
            >
              {/* An off-crawl target is counted but was never a node, so it has
                  no detail route to link to. */}
              {neighbour.site_url_id ? (
                <ProjectLink
                  href={`/site/crawls/${crawlId}/pages/${neighbour.site_url_id}`}
                  className="text-accent-text mono min-w-0 text-xs leading-4 [overflow-wrap:anywhere] hover:underline"
                  title={neighbour.url}
                >
                  {neighbour.url}
                </ProjectLink>
              ) : (
                <span
                  className="mono text-secondary min-w-0 text-xs leading-4 [overflow-wrap:anywhere]"
                  title={neighbour.url}
                >
                  {neighbour.url}
                </span>
              )}
              <span className="flex shrink-0 items-center gap-1.5">
                {neighbour.main_content ? <Badge>Main</Badge> : null}
                {neighbour.nofollow ? <Badge className="text-muted">nofollow</Badge> : null}
                <span className="mono text-muted text-xs">×{neighbour.anchor_count}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
