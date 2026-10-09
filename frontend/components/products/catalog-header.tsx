'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CsvImportTrigger } from '@/components/ui/csv-import';
import { StatGrid, type StatItemProps } from '@/components/ui/stat-grid';
import { textRole } from '@/components/ui/typography';
import { commerceApi } from '@/lib/api/commerce';
import { queryKeys } from '@/lib/api/query-keys';
import { siteHealthApi, siteHealthQueries } from '@/lib/api/site-health';
import { crawlBadgeValue, crawlPollInterval, statusLabel } from '@/lib/site-health/status';

import type { SiteCrawl } from '@/lib/api/types';

import type { CommerceQueries } from './commerce-queries';

/**
 * Pages analyzed over the crawl's own inventory.
 *
 * The denominator is the site inventory the crawl holds, which is never below
 * what it analyzed — reading it off the discovery FETCH counter is what
 * rendered "49/1". The client still floors it, because a crawl whose counters
 * are mid-flight must not print a fraction that reads backwards.
 */
/** The dashboard's crawl, exactly as the query returns it (nullable). */
type SiteHealthCrawl = SiteCrawl | null;

function analyzedLabel(crawl: SiteHealthCrawl): string | null {
  if (!crawl) return null;
  const known = crawl.total_url_count ?? crawl.visible_url_count;
  return `${crawl.analyzed_count}/${Math.max(known, crawl.analyzed_count)}`;
}

type Projection = NonNullable<CommerceQueries['catalog']['data']>['projection'];

/**
 * Pages still being turned into catalog rows, then pages of the latest crawl
 * that could not be. A finished, clean projection shows nothing.
 */
function projectionBadge(projection: Projection | undefined) {
  if (projection?.in_flight)
    return (
      <Badge variant="status" value="info">
        {projection.in_flight} projecting
      </Badge>
    );
  if (projection?.failed)
    return (
      <Badge variant="status" value="danger">
        {projection.failed} {projection.failed === 1 ? 'page' : 'pages'} not projected
      </Badge>
    );
  return null;
}

/** The catalog-wide metrics half of the toolbar: counts, crawl, queue. */
function CatalogStats({
  counts,
  crawl,
}: Readonly<{
  counts: CommerceQueries['catalog']['data'];
  crawl: SiteHealthCrawl;
}>) {
  const items: (StatItemProps & { key: string })[] = [
    {
      key: 'products',
      label: 'Products',
      value: counts ? `${counts.products.length}` : null,
    },
    {
      key: 'categories',
      label: 'Categories',
      value: counts ? `${counts.categories.length}` : null,
    },
    { key: 'analyzed', label: 'Pages analyzed', value: analyzedLabel(crawl) },
    {
      key: 'site-health',
      label: 'Site Health',
      value: crawl ? (
        <Badge variant="run-status" value={crawlBadgeValue(crawl.status)}>
          {statusLabel(crawl.status)}
        </Badge>
      ) : (
        <Badge>No crawl yet</Badge>
      ),
    },
  ];
  const projection = projectionBadge(counts?.projection);
  if (projection) items.push({ key: 'projection', label: 'Projection', value: projection });
  return <StatGrid surface="open" size="figure" items={items} />;
}

/**
 * Catalog-WIDE state and catalog-wide actions, and nothing target-scoped.
 *
 * It used to be a `<Card>` holding both halves — the only toolbar in the app
 * boxed in one, which is exactly the inconsistency the page grammar removes.
 * The two halves now go where the grammar puts them: the actions are route
 * actions and belong to the identity band, the counts are evidence and belong
 * at the top of the content region. So this is a hook that owns the mutations
 * once and hands back the pieces, rather than a component that has to render
 * them side by side to keep them together.
 */
export function useCatalogHeader({
  workspaceId,
  projectId,
  query,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  query: CommerceQueries['catalog'];
}>) {
  const client = useQueryClient();
  const [result, setResult] = useState('');
  const dashboard = useQuery({
    ...siteHealthQueries.dashboard(workspaceId, projectId),
    // The workspace can still be resolving; this used to be gated by the
    // caller mounting the component at all, and the hook has to gate itself.
    enabled: Boolean(workspaceId && projectId),
    refetchInterval: (state) => {
      const crawl = state.state.data?.crawl;
      return crawl ? crawlPollInterval(crawl) : false;
    },
  });
  const invalidateCatalog = () =>
    client.invalidateQueries({
      queryKey: queryKeys.commerce.catalog(projectId),
    });
  const importCatalog = useMutation({
    mutationFn: async (file: File) =>
      commerceApi.importCatalog(projectId, await file.text(), file.name, {
        workspaceId,
      }),
    onSuccess: async (data) => {
      setResult(
        `${data.created} created, ${data.updated} updated, ${data.unchanged} unchanged, ${data.rejected} rejected`,
      );
      await invalidateCatalog();
    },
  });
  const discover = useMutation({
    mutationFn: () => siteHealthApi.createCrawl({ project_id: projectId }, { workspaceId }),
    onSuccess: async () => {
      await Promise.all([dashboard.refetch(), query.refetch()]);
    },
  });
  const crawl = dashboard.data?.crawl ?? null;
  const counts = query.data;
  return {
    actions: (
      <CatalogActions
        crawl={crawl}
        importing={importCatalog.isPending}
        onImport={(file) => importCatalog.mutate(file)}
        refreshing={discover.isPending || dashboard.isPending}
        onRefresh={() =>
          crawl ? void Promise.all([dashboard.refetch(), query.refetch()]) : discover.mutate()
        }
      />
    ),
    stats: <CatalogStats counts={counts} crawl={crawl} />,
    notices: (
      <CatalogNotices
        result={result}
        importFailed={importCatalog.isError}
        refreshFailed={discover.isError || dashboard.isError}
      />
    ),
  };
}

/** The catalog's route actions, for the identity band. */
function CatalogActions({
  crawl,
  importing,
  onImport,
  refreshing,
  onRefresh,
}: Readonly<{
  crawl: SiteHealthCrawl;
  importing: boolean;
  onImport: (file: File) => void;
  refreshing: boolean;
  onRefresh: () => void;
}>) {
  return (
    <>
      <CsvImportTrigger
        accessibleLabel="Import catalog CSV"
        size="sm"
        pending={importing}
        onSelect={onImport}
      />
      <Button size="sm" disabled={refreshing} onClick={onRefresh}>
        {crawl ? 'Refresh from Site Health' : 'Run Site Health crawl'}
      </Button>
    </>
  );
}

/** Whatever the last catalog-wide action has to report, above the counts. */
function CatalogNotices({
  result,
  importFailed,
  refreshFailed,
}: Readonly<{ result: string; importFailed: boolean; refreshFailed: boolean }>) {
  if (!result && !importFailed && !refreshFailed) return null;
  return (
    <div className="grid gap-[var(--compact-gap)]">
      {result ? <p className={textRole('body')}>{result}</p> : null}
      {importFailed ? <Alert tone="danger">The catalog import failed.</Alert> : null}
      {refreshFailed ? (
        <Alert tone="danger">Site Health progress could not be refreshed.</Alert>
      ) : null}
    </div>
  );
}
