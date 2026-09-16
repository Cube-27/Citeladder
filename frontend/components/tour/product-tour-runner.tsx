'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

import { workspacesApi } from '@/lib/api/workspaces';
import { scopedNavigationDestination } from '@/lib/navigation/project-destination';
import { queryKeys } from '@/lib/api/query-keys';
import type { ProductTour, ProductTourStatus } from '@/lib/api/types';

import { PRODUCT_TOUR_STEPS, TOUR_VERSION, stepAt, isCurrentStepLocation } from './product-tour';

/**
 * The live tour: driver.js, its stylesheet, and the effect that drives it.
 *
 * Separate from the provider because this module is the only reason driver.js
 * existed in the chunk the browser downloads before it can paint. The provider
 * mounts this lazily and ONLY while a tour is actually in progress, which for
 * everyone past their first session is never.
 */
export default function ProductTourRunner({
  tour,
  workspaceId,
  pathname,
  search,
  activeProjectId,
  activeWorkspaceId,
}: Readonly<{
  tour: ProductTour;
  workspaceId: string;
  pathname: string;
  search: string;
  activeProjectId: string | null;
  activeWorkspaceId: string | null;
}>) {
  const router = useNavigate();
  const queryClient = useQueryClient();
  const renderedStep = useRef<string | null>(null);
  const transitioning = useRef(false);
  const terminalSkipAttempt = useRef<string | null>(null);
  const [targetRetry, setTargetRetry] = useState(0);

  const update = useMutation({
    mutationFn: (payload: { status: ProductTourStatus; step_id?: string | null }) =>
      workspacesApi.updateProductTour(workspaceId, { version: TOUR_VERSION, ...payload }),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.workspaces.productTour(workspaceId), next);
      renderedStep.current = null;
      transitioning.current = false;
      terminalSkipAttempt.current = null;
      setTargetRetry(0);
    },
    onError: () => {
      renderedStep.current = null;
      transitioning.current = false;
    },
  });

  // `useMutation` returns a fresh object every render, so depending on the
  // result itself made `persist` — and therefore the effect below — change
  // identity on every render. The effect tore down and rebuilt the driver
  // instance each time, mid-step. Depend on the two stable fields instead;
  // `components/layout/user-menu.tsx` solves the same problem the same way.
  const { mutate: updateMutate, isPending: updateIsPending } = update;
  const persist = useCallback(
    (status: ProductTourStatus, stepId?: string | null) => {
      if (updateIsPending) return;
      updateMutate({ status, step_id: stepId });
    },
    [updateMutate, updateIsPending],
  );

  useEffect(() => {
    let retryTimeout: number | undefined;
    let instance: ReturnType<typeof driver> | null = null;
    let instanceDestroyed = false;
    const destroyInstance = () => {
      if (!instance || instanceDestroyed) return;
      instanceDestroyed = true;
      instance.destroy();
      if (renderedStep.current === stepAt(tour.step_id).id) {
        renderedStep.current = null;
      }
    };
    const cleanup = () => {
      if (retryTimeout !== undefined) window.clearTimeout(retryTimeout);
      destroyInstance();
    };

    if (updateIsPending) return cleanup;

    const step = stepAt(tour.step_id);
    // Navigate before looking for the hook. The previous ordering searched the
    // current page first; after step two the provider-settings hook was absent,
    // so the tour only retried and then silently disappeared.
    if (!isCurrentStepLocation(pathname, search, step.path)) {
      // A tour step can target another client-routed screen; no content is shown meanwhile.
      // Carry the selection so the destination is the one the shell would have
      // rewritten to anyway, rather than a bare path it immediately replaces.
      // react-doctor-disable-next-line
      router(
        scopedNavigationDestination(
          step.path,
          step.scope ?? 'project',
          activeProjectId,
          activeWorkspaceId,
        ),
      );
      return cleanup;
    }
    const target = document.querySelector<HTMLElement>(step.selector);
    if (!target) {
      if (targetRetry < 12) {
        retryTimeout = window.setTimeout(() => setTargetRetry((value) => value + 1), 100);
      } else {
        // Empty/new workspaces may not render a step's target yet (for example,
        // Command Center has no dashboard cards before the first audit). Do not
        // leave the tour in_progress: its route-aware effect would otherwise
        // force every later sidebar navigation back to this unavailable step.
        const skipAttemptKey = `${workspaceId}:${step.id}`;
        if (terminalSkipAttempt.current !== skipAttemptKey) {
          terminalSkipAttempt.current = skipAttemptKey;
          persist('skipped');
        }
      }
      return cleanup;
    }
    if (renderedStep.current === step.id) return cleanup;

    renderedStep.current = step.id;
    const stepIndex = PRODUCT_TOUR_STEPS.findIndex((candidate) => candidate.id === step.id);
    instance = driver({
      animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      allowClose: true,
      allowKeyboardControl: true,
      // The scrim token carries its own alpha (light 49% / dark 60%), so the
      // library's additional opacity multiply stays at 1. Applied as the
      // overlay SVG's inline fill, the var() resolves per active theme.
      overlayColor: 'var(--overlay-scrim)',
      overlayOpacity: 1,
      // Themed via app/tour.css (.driver-popover.citeladder-tour).
      popoverClass: 'citeladder-tour',
      popoverOffset: 12,
      stagePadding: 6,
      stageRadius: 12,
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      // We drive step-by-step with highlight() rather than a steps array, so
      // the library cannot compute {{current}}/{{total}} itself — stamp the
      // progress readout when the popover renders.
      onPopoverRender: (popover) => {
        popover.progress.textContent = `${stepIndex + 1} of ${PRODUCT_TOUR_STEPS.length}`;
      },
      onNextClick: () => {
        transitioning.current = true;
        destroyInstance();
        const next = PRODUCT_TOUR_STEPS[stepIndex + 1];
        persist(next ? 'in_progress' : 'completed', next?.id ?? null);
      },
      onPrevClick: () => {
        const previous = PRODUCT_TOUR_STEPS[Math.max(0, stepIndex - 1)];
        if (previous.id === step.id) return;
        transitioning.current = true;
        destroyInstance();
        persist('in_progress', previous.id);
      },
      onDestroyStarted: () => {
        if (!transitioning.current) persist('skipped');
        destroyInstance();
      },
    });
    instance.highlight({
      element: target,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side,
        align: step.align,
        showButtons: ['previous', 'next', 'close'],
        nextBtnText: stepIndex === PRODUCT_TOUR_STEPS.length - 1 ? 'Done' : 'Next',
      },
    });
    return cleanup;
  }, [
    activeProjectId,
    activeWorkspaceId,
    pathname,
    persist,
    router,
    search,
    targetRetry,
    tour,
    updateIsPending,
    workspaceId,
  ]);

  return null;
}
