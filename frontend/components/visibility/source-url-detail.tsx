import { AppGrid } from '@/components/ui/app-grid';
import { BrandMark } from '@/components/ui/brand-mark';
import { Inline, Stack } from '@/components/ui/layout';
import { BusyRung } from '@/components/ui/rung-meter';
import { Skeleton } from '@/components/ui/skeleton';
import { TextLink } from '@/components/ui/text-link';
import { SourceBreadcrumb } from '@/components/visibility/source-breadcrumb';
import { SourcePrompts } from '@/components/visibility/source-prompts';
import type { SourceFilters } from '@/components/visibility/source-rows';
import { UsageCard } from '@/components/visibility/source-charts';
import { BrandsCard, EnginesCard } from '@/components/visibility/source-url-cards';
import { SourceUrlPageCard } from '@/components/visibility/source-url-page';
import { count, hostOf, pathOf, ratio, sinceLabel } from '@/lib/visibility/sources';
import {
  useSourceSeries,
  useSourceUrl,
  type SourceQueries,
} from '@/lib/visibility/use-source-analysis';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { Section, SectionContent, SectionHeader, SectionTitle } from '@/components/ui/section';
import { FigureStrip } from '@/components/ui/figure-strip';

/**
 * One cited URL: whether there is something to do about it, what is on it,
 * how engines use it over time, and the answers that used it.
 *
 * Every figure here is scoped to the selection above it, including First seen —
 * which is the earliest sighting in the period being looked at, not the page's
 * age. The label says "in this period" for that reason: a reader who narrows
 * to thirty days and sees the date move would otherwise conclude the page had
 * been republished.
 */
export function SourceUrlDetail({
  url,
  domain,
  filters,
  queries,
  onBack,
  onOpenInventory,
}: Readonly<{
  url: string;
  domain: string | null;
  filters: SourceFilters;
  queries: SourceQueries;
  /** Up one level: the domain's page when opened from it, else the inventory. */
  onBack: () => void;
  /** All the way out to the Domains / URLs inventory. */
  onOpenInventory: () => void;
}>) {
  const query = useSourceUrl(filters, queries, url);
  const usage = useSourceSeries(filters, queries, {
    dimension: 'url',
    domain: null,
    sourceType: null,
    url,
  });
  const data = query.data;
  // Pending, not merely loading: a read still waiting on its run fetches
  // nothing, and no data then is not "no engine used this page".
  const pending = query.isPending;
  const title = data?.title?.trim() || pathOf(url);

  return (
    <Stack gap="workspace">
      <SourceBreadcrumb
        // Two crumbs, two destinations. Both calling `onBack` meant clicking
        // "Sources" from a URL opened inside a domain landed on that domain.
        trail={[
          { label: 'Sources', onClick: onOpenInventory },
          ...(domain ? [{ label: domain, onClick: onBack }] : []),
        ]}
      />

      <Section className="relative" aria-busy={query.isFetching}>
        <BusyRung active={query.isFetching} label="Updating source" />
        <PageIdentity title={title} url={url} />
        <SectionContent>
          {query.isError ? (
            <Notice
              kind="read"
              {...readErrorProps(query)}
              title="Couldn't load this source"
              fallback="The request failed or timed out."
            />
          ) : null}
          {pending ? <Skeleton variant="facts" /> : null}
          {data ? <Overview data={data} /> : null}
        </SectionContent>
      </Section>

      <SourceUrlPageCard url={url} page={data?.page} loading={pending} />

      <UsageCard dimension="url" query={usage} heading="Use over time" />

      <AppGrid layout="halves">
        <EnginesCard engines={data?.engines} loading={pending} errored={query.isError} />
        <BrandsCard brands={data?.brands} loading={pending} errored={query.isError} />
      </AppGrid>

      <SourcePrompts filters={filters} queries={queries} url={url} />
    </Stack>
  );
}

/** The page's mark, its title and the live link to it. */
function PageIdentity({ title, url }: Readonly<{ title: string; url: string }>) {
  const host = hostOf(url);
  return (
    <SectionHeader>
      <Inline gap="compact" className="items-start">
        <BrandMark
          name={host ?? url}
          websiteUrl={host ? `https://${host}` : null}
          placement="header"
        />
        <Stack gap="tight" className="min-w-0">
          <SectionTitle className="truncate">{title}</SectionTitle>
          {/* An unsafe cited URL renders as plain text rather than a link. */}
          <TextLink variant="external" text="caption" href={url} className="min-w-0">
            <span className="truncate">{url}</span>
          </TextLink>
        </Stack>
      </Inline>
    </SectionHeader>
  );
}

function Overview({
  data,
}: Readonly<{ data: NonNullable<ReturnType<typeof useSourceUrl>['data']> }>) {
  return (
    <FigureStrip
      segments={[
        { key: 'citation-rate', label: 'Citation rate', value: ratio(data.citation_rate) },
        { key: 'retrievals', label: 'Retrievals', value: count(data.retrievals) },
        { key: 'citations', label: 'Citations', value: count(data.citations) },
        { key: 'prompts', label: 'Prompts using it', value: count(data.prompts) },
        {
          key: 'first-seen',
          label: 'First seen in this period',
          value: sinceLabel(data.first_seen),
        },
        { key: 'last-seen', label: 'Last seen', value: sinceLabel(data.last_seen) },
      ]}
    />
  );
}
