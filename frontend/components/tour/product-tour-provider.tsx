'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Suspense, lazy, useEffect, type ReactNode } from 'react';

import { workspacesApi } from '@/lib/api/workspaces';
import { queryKeys } from '@/lib/api/query-keys';
import { useProjectContext } from '@/lib/project/project-context';

import { PRODUCT_TOUR_STEPS, TOUR_VERSION } from './product-tour';

/**
 * Whether this workspace owes its reader a tour, and nothing else.
 *
 * The tour itself — driver.js, its stylesheet, and the effect that drives it —
 * lives in `product-tour-runner`, loaded only while one is actually in
 * progress. This provider mounts on every authenticated route, so anything it
 * imports statically is downloaded before the app can paint; for everyone past
 * their first session that was a tour library they will never see.
 */
const ProductTourRunner = lazy(() => import('./product-tour-runner'));

export function ProductTourProvider({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = useLocation().pathname ?? '';
  const search = useSearchParams()[0].toString();
  const queryClient = useQueryClient();
  const { activeProject, activeProjectId, activeWorkspaceId } = useProjectContext();
  const workspaceId = activeProject?.workspace_id ?? null;

  const tourQuery = useQuery({
    queryKey: queryKeys.workspaces.productTour(workspaceId ?? ''),
    queryFn: ({ signal }) => workspacesApi.getProductTour(workspaceId!, { signal }),
    enabled: Boolean(workspaceId),
  });

  const start = useMutation({
    mutationFn: () =>
      workspacesApi.updateProductTour(workspaceId!, {
        version: TOUR_VERSION,
        status: 'in_progress',
        step_id: PRODUCT_TOUR_STEPS[0].id,
      }),
    onSuccess: (tour) => {
      queryClient.setQueryData(queryKeys.workspaces.productTour(workspaceId ?? ''), tour);
    },
  });

  // Opening the tour is the provider's job, not the runner's: the runner only
  // exists once there is a tour to run, so asking it to start one would mean
  // loading it for every workspace that has already finished.
  const { mutate: startTour, isPending: starting } = start;
  const notStarted = tourQuery.data?.status === 'not_started';
  useEffect(() => {
    if (!workspaceId || !notStarted || starting) return;
    startTour();
  }, [workspaceId, notStarted, starting, startTour]);

  const tour = tourQuery.data;
  const running = Boolean(workspaceId) && tour?.status === 'in_progress';

  return (
    <>
      {children}
      {running && workspaceId ? (
        <Suspense fallback={null}>
          <ProductTourRunner
            tour={tour}
            workspaceId={workspaceId}
            pathname={pathname}
            search={search}
            activeProjectId={activeProjectId}
            activeWorkspaceId={activeWorkspaceId}
          />
        </Suspense>
      ) : null}
    </>
  );
}
