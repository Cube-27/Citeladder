'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/layout/scoped-link';
import { buttonVariants } from '@/components/ui/button-variants';
import { CsvImportTrigger } from '@/components/ui/csv-import';
import { menuPanelClasses } from '@/components/ui/menu-variants';
import { Label, Metric, textRole } from '@/components/ui/typography';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { commerceApi } from '@/lib/api/commerce';
import { queryKeys } from '@/lib/api/query-keys';
import { siteHealthApi, siteHealthQueries } from '@/lib/api/site-health';
import {
  PLACEHOLDER,
  crawlBadgeValue,
  crawlPollInterval,
  statusLabel,
} from '@/lib/site-health/status';

import type { SiteCrawl } from '@/lib/api/types';
import { cn } from '@/lib/utils';

import type { CommerceQueries } from './commerce-queries';

/** One metric: micro-label above a tabular value. The row's only unit. */
function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label>{label}</Label>
      {value === PLACEHOLDER ? (
        <UnavailableValue state="not_measured" />
      ) : (
        <Metric className="text-2xl">{value}</Metric>
      )}
    </div>
  );
}

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

function analyzedLabel(crawl: SiteHealthCrawl): string {
  if (!crawl) return PLACEHOLDER;
  const known = crawl.total_url_count ?? crawl.visible_url_count;
  return `${crawl.analyzed_count}/${Math.max(known, crawl.analyzed_count)}`;
}

/** In-flight projection work, or '' when the queue is idle. */
function projectionLabel(tasks: Record<string, number> | undefined): string {
  const pending = Object.entries(tasks ?? {})
    .filter(([status, count]) => count > 0 && status !== 'succeeded')
    .reduce((total, [, count]) => total + count, 0);
  return pending ? `${pending} projecting` : '';
}

/** The catalog-wide metrics half of the toolbar: counts, crawl, queue. */
function CatalogStats({
  counts,
  crawl,
  projecting,
}: Readonly<{
  counts: CommerceQueries['catalog']['data'];
  crawl: SiteHealthCrawl;
  projecting: string;
}>) {
  return (
    <div className="border-border-subtle flex flex-wrap items-center gap-x-[var(--page-section-gap)] gap-y-4 border-b pb-[var(--workspace-gap)] min-[981px]:border-b-0 min-[981px]:pb-0">
      <Stat label="Products" value={counts ? `${counts.products.length}` : PLACEHOLDER} />
      <Stat label="Categories" value={counts ? `${counts.categories.length}` : PLACEHOLDER} />
      <Stat label="Pages analyzed" value={analyzedLabel(crawl)} />
      <div className="flex flex-col items-start gap-0.5">
        <Label>Site Health</Label>
        {crawl ? (
          <Badge variant="run-status" value={crawlBadgeValue(crawl.status)}>
            {statusLabel(crawl.status)}
          </Badge>
        ) : (
          <Badge>No crawl yet</Badge>
        )}
      </div>
      {projecting ? (
        <div className="flex flex-col items-start gap-0.5">
          <Label>Projection</Label>
          <Badge variant="status" value="info">
            {projecting}
          </Badge>
        </div>
      ) : null}
    </div>
  );
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
  const projecting = projectionLabel(counts?.projection_tasks);
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
    stats: <CatalogStats counts={counts} crawl={crawl} projecting={projecting} />,
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
      <details className="relative">
        <summary className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'list-none')}>
          More actions <ChevronDown className="size-3.5" aria-hidden />
        </summary>
        <div
          className={cn(
            menuPanelClasses,
            'absolute top-[calc(100%+0.375rem)] right-0 z-10 grid min-w-48 gap-1',
          )}
        >
          <CsvImportTrigger
            accessibleLabel="Import catalog CSV"
            pending={importing}
            onSelect={onImport}
          />
          <Button asChild variant="ghost" className="justify-start">
            <ProjectLink href="/site" target="_blank" rel="noreferrer">
              Open Site Health
            </ProjectLink>
          </Button>
        </div>
      </details>
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
