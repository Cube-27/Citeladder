'use client';

/**
 * State + queries for the `/products` Commerce workspace.
 *
 * `useProductsTab` mirrors the active tab into `?tab=` (Catalog is default)
 * so refresh / back / forward preserve it. `useCatalogQueries` loads the
 * catalog + the commerce catalog-health projection. `useProductVisibilityQueries`
 * loads the project's dashboard-ready runs (for the Run selector) and the
 * product visibility projection — defaulting to the latest product audit,
 * sliced by the engine + surface filters via the backend's persisted
 * aggregates. `useAttributionQueries` loads the persisted A1/A2 attribution
 * snapshot and owns the recompute enqueue/poll cycle. Every hook takes an
 * explicit `enabled` flag so only the ACTIVE tab's queries run.
 */
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { attributionApi } from '@/lib/api/attribution';
import { commerceApi } from '@/lib/api/commerce';
import { queryKeys } from '@/lib/api/query-keys';
import { productsApi } from '@/lib/api/products';
import { runsApi } from '@/lib/api/runs';
import {
  ATTRIBUTION_RECOMPUTE_POLL_MS,
  isActiveAttributionTask,
  rangeToWindow,
  type AnalyticsGranularity,
  type AnalyticsRange,
} from '@/lib/products/attribution';
import {
  normalizeProductsTab,
  type ProductEngineFilter,
  type ProductsTab,
} from '@/lib/products/catalog';
import { toRunOptions } from '@/lib/visibility/dashboard';

export function useProductsTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = normalizeProductsTab(searchParams?.get('tab'));

  const [activeTab, setActiveTab] = useState<ProductsTab>(urlTab);
  useEffect(() => {
    // Intentional URL→state sync (external navigation is the source of truth).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab(urlTab);
  }, [urlTab]);

  function selectTab(tab: ProductsTab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return { activeTab, selectTab };
}

export function useCatalogQueries(projectId: string | null, enabled = true) {
  const productsQuery = useQuery({
    queryKey: queryKeys.products.list(projectId ?? ''),
    queryFn: ({ signal }) => productsApi.list(projectId!, { signal }),
    // Only fetch on the Catalog tab — the other tabs never read these.
    enabled: Boolean(projectId) && enabled,
  });
  const catalogHealthQuery = useQuery({
    queryKey: queryKeys.commerce.catalogHealth(projectId ?? ''),
    queryFn: ({ signal }) => commerceApi.getCatalogHealth(projectId!, { signal }),
    enabled: Boolean(projectId) && enabled,
  });
  return { productsQuery, catalogHealthQuery };
}

export function useProductVisibilityQueries(projectId: string | null, enabled = true) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [engine, setEngine] = useState<ProductEngineFilter>('all');
  // Analysis surface slice: '' is the measurement surface (the UI labels it
  // "Answer-engine APIs"); configured surface ids arrive via the projection.
  const [surface, setSurface] = useState<string>('');

  const auditsQuery = useQuery({
    queryKey: queryKeys.runs.list({ project_id: projectId ?? '' }),
    queryFn: ({ signal }) => runsApi.listAudits({ project_id: projectId! }, { signal }),
    // Only fetch on the Visibility tab — the Catalog tab never reads these.
    enabled: Boolean(projectId) && enabled,
  });
  const runOptions = useMemo(() => toRunOptions(auditsQuery.data ?? []), [auditsQuery.data]);

  // An explicit selection that still exists, else the latest (null = the
  // backend resolves the latest product audit itself).
  const activeRunId = useMemo(() => {
    if (selectedRunId && runOptions.some((run) => run.id === selectedRunId)) {
      return selectedRunId;
    }
    return null;
  }, [runOptions, selectedRunId]);

  const engineParam = engine === 'all' ? undefined : engine;
  const visibilityQuery = useQuery({
    queryKey: queryKeys.products.visibility(
      projectId ?? '',
      activeRunId ?? undefined,
      engineParam,
      surface,
    ),
    queryFn: ({ signal }) =>
      productsApi.getProductVisibility(
        projectId!,
        { audit_id: activeRunId ?? undefined, engine: engineParam, surface },
        { signal },
      ),
    enabled: Boolean(projectId) && enabled,
  });

  return {
    auditsQuery,
    runOptions,
    activeRunId,
    selectRun: setSelectedRunId,
    engine,
    setEngine,
    engineParam,
    surface,
    setSurface,
    visibilityQuery,
  };
}

/**
 * Attribution tab orchestration: range/granularity state (the shared
 * analytics options vocabulary), the persisted snapshot query, and the
 * recompute enqueue → 3s task poll → invalidate cycle. The recompute posts
 * once, stores the returned task id, and polls only that task until a
 * terminal status; a SUCCEEDED task invalidates ONLY the current snapshot
 * namespace, while failed/cancelled keeps the current snapshot on screen
 * (no refetch — nothing new was persisted).
 */
export function useAttributionQueries(projectId: string | null, enabled = true) {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<AnalyticsRange>('latest');
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('week');

  // Resolve the range preset to `from`/`to` date bounds once per range
  // (`latest` sends no bounds — the backend serves the freshest snapshot).
  const windowBounds = useMemo(() => rangeToWindow(range), [range]);
  const filters = useMemo(
    () => ({
      from: windowBounds.from ?? null,
      to: windowBounds.to ?? null,
      granularity,
    }),
    [windowBounds, granularity],
  );

  const snapshotQuery = useQuery({
    queryKey: queryKeys.attribution.snapshot(projectId ?? '', filters),
    queryFn: ({ signal }) =>
      attributionApi.getSnapshot(projectId!, { ...windowBounds, granularity }, { signal }),
    enabled: Boolean(projectId) && enabled,
  });

  const [recomputeTaskId, setRecomputeTaskId] = useState<string | null>(null);
  // The succeeded task poll below invalidates the exact snapshot key.
  // react-doctor-disable-next-line
  const recomputeMutation = useMutation({
    mutationFn: () => attributionApi.recompute(projectId!),
    onSuccess: (task) => setRecomputeTaskId(task.task_id),
  });

  const recomputeTaskQuery = useQuery({
    queryKey: queryKeys.attribution.recompute(projectId ?? '', recomputeTaskId ?? ''),
    queryFn: ({ signal }) => attributionApi.getRecompute(projectId!, recomputeTaskId!, { signal }),
    enabled: Boolean(projectId) && enabled && recomputeTaskId !== null,
    refetchInterval: (query) => {
      const polled = query.state.data;
      if (!polled) return ATTRIBUTION_RECOMPUTE_POLL_MS;
      return isActiveAttributionTask(polled.status) ? ATTRIBUTION_RECOMPUTE_POLL_MS : false;
    },
  });

  const recomputeStatus = recomputeTaskQuery.data?.status;
  const recomputeTerminal =
    recomputeStatus !== undefined && !isActiveAttributionTask(recomputeStatus);

  // Succeeded → the refreshed snapshot is (being) persisted: invalidate only
  // the current window/granularity namespace. Failed/cancelled persists no
  // new snapshot, so the current one stays on screen untouched (the panel
  // surfaces the explicit failure instead of refetching).
  useEffect(() => {
    if (recomputeStatus !== 'succeeded') return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.attribution.snapshot(projectId ?? '', filters),
    });
  }, [recomputeStatus, queryClient, projectId, filters]);

  return {
    range,
    setRange,
    granularity,
    setGranularity,
    filters,
    snapshotQuery,
    recomputeMutation,
    recomputeTaskQuery,
    recomputeTerminal,
  };
}
