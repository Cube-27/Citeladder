'use client';

import { ExternalLink } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { BrandLogo } from '@/components/ui/brand-logo';
import { BusyBar } from '@/components/ui/busy-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { MetricGroup, MetricItem } from '@/components/ui/workspace';
import { SourceBreadcrumb } from '@/components/visibility/source-breadcrumb';
import { SourcePrompts } from '@/components/visibility/source-prompts';
import type { SourceFilters } from '@/components/visibility/source-rows';
import { BrandsCard, EnginesCard, PromptsCard } from '@/components/visibility/source-url-cards';
import { availabilityLabel } from '@/lib/format';
import { count, hostOf, pathOf, ratio, sinceLabel } from '@/lib/visibility/sources';
import { safeExternalUrl } from '@/lib/visibility/urls';
import { useSourceUrl, type SourceQueries } from '@/lib/visibility/use-source-analysis';

const NOT_MEASURED = availabilityLabel('not_measured');

/**
 * One cited URL: what it is, how it performs, and the answers that used it.
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
  const data = query.data;
  const title = data?.title?.trim() || pathOf(url);

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <SourceBreadcrumb
        // Two crumbs, two destinations. Both calling `onBack` meant clicking
        // "Sources" from a URL opened inside a domain landed on that domain.
        trail={[
          { label: 'Sources', onClick: onOpenInventory },
          ...(domain ? [{ label: domain, onClick: onBack }] : []),
        ]}
        current={title}
      />

      <Card className="relative" aria-busy={query.isFetching}>
        <BusyBar active={query.isFetching} label="Updating source" />
        <PageIdentity title={title} url={url} />
        <CardContent>
          {query.isError ? <Alert tone="danger">Could not load this source.</Alert> : null}
          {query.isLoading ? <Skeleton className="h-20 w-full" /> : null}
          {data ? <Overview data={data} /> : null}
        </CardContent>
      </Card>

      <div className="grid gap-[var(--workspace-gap)] xl:grid-cols-2">
        <EnginesCard engines={data?.engines} loading={query.isLoading} errored={query.isError} />
        <BrandsCard brands={data?.brands} loading={query.isLoading} errored={query.isError} />
      </div>

      <PromptsCard rows={data?.prompt_rows} loading={query.isLoading} errored={query.isError} />

      <SourcePrompts filters={filters} queries={queries} url={url} />
    </div>
  );
}

/** The page's mark, its title and the live link to it. */
function PageIdentity({ title, url }: Readonly<{ title: string; url: string }>) {
  const href = safeExternalUrl(url);
  const host = hostOf(url);
  return (
    <CardHeader className="flex-row items-start gap-3">
      <BrandLogo name={host ?? url} websiteUrl={host ? `https://${host}` : null} size="lg" />
      <div className="grid min-w-0 gap-1">
        <CardTitle className="truncate">{title}</CardTitle>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={textRole(
              'meta',
              'text-secondary hover:text-accent-text inline-flex min-w-0 items-center gap-1.5 transition-colors hover:underline',
            )}
          >
            <span className="truncate">{url}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        ) : (
          <span className={textRole('meta', 'text-secondary truncate')}>{url}</span>
        )}
      </div>
    </CardHeader>
  );
}

function Overview({
  data,
}: Readonly<{ data: NonNullable<ReturnType<typeof useSourceUrl>['data']> }>) {
  return (
    <MetricGroup>
      <MetricItem label="Citation rate" value={ratio(data.citation_rate) ?? NOT_MEASURED} />
      <MetricItem label="Retrievals" value={count(data.retrievals) ?? NOT_MEASURED} />
      <MetricItem label="Citations" value={count(data.citations) ?? NOT_MEASURED} />
      <MetricItem label="Prompts using it" value={count(data.prompts) ?? NOT_MEASURED} />
      <MetricItem
        label="First seen in this period"
        value={sinceLabel(data.first_seen) ?? NOT_MEASURED}
      />
      <MetricItem label="Last seen" value={sinceLabel(data.last_seen) ?? NOT_MEASURED} />
    </MetricGroup>
  );
}
