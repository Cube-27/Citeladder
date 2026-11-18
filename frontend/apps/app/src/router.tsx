import { lazy, Suspense } from 'react';
import { redirect, type RouteObject } from 'react-router-dom';

import { RouteLoadingScreen } from '@/components/layout/page-shell';
import { FirstFrame } from '@/components/layout/first-frame';
import { APP_ROUTES, HOME_PATH } from '@/lib/navigation/app-routes';
import type { AppRouteRecord } from '@/lib/navigation/route-types';
import { registerRouteChunk } from '@/lib/navigation/route-chunks';
import { bootstrapPrivateRoutes } from '@/lib/project/bootstrap-loader';
import { NotFoundScreen } from '@/components/templates/not-found-screen';
import { RouteError, ScreenError, ShellRouteError } from './route-error';
import { ApplicationRouteLayout, PrivateRouteLayout } from './private-routes';

/**
 * Begin the route download at matching time, alongside session bootstrap, or
 * earlier on navigation intent. The loader never waits for it; Suspense owns
 * only the route content pane. Inside the application shell its fallback is
 * the route's own loading frame (identity band + loading box), not a bare
 * pane; a flow route outside the shell (sign-in, setup, the chooser) waits on
 * its plain first frame, never a loading card (PR 524).
 */
function manifestRoute(route: AppRouteRecord): RouteObject {
  let module: ReturnType<AppRouteRecord['screen']> | undefined;
  const load = () => (module ??= route.screen());
  registerRouteChunk(route.path, load);
  const Screen = lazy(load);
  return {
    path: route.path,
    loader: () => {
      // React.lazy surfaces any failure through RouteError when the leaf mounts.
      void load().catch(() => {});
      return null;
    },
    element: (
      <Suspense fallback={route.shell ? <RouteLoadingScreen /> : <FirstFrame />}>
        <Screen />
      </Suspense>
    ),
  };
}

const routes: readonly AppRouteRecord[] = APP_ROUTES;

export const appRoutes: RouteObject[] = [
  { path: '/', loader: () => redirect(HOME_PATH) },
  ...routes
    .filter((route) => route.scope === 'public')
    .map((route) => ({ ...manifestRoute(route), ErrorBoundary: RouteError })),
  {
    element: <PrivateRouteLayout />,
    // Resolve session, workspace and project BEFORE the shell mounts, so an
    // account with no projects reaches setup in one paint instead of watching
    // the application chrome build itself and then be replaced.
    loader: bootstrapPrivateRoutes,
    // Once per document. In-app navigation is answered by the providers this
    // seeded, which stay mounted and keep their own queries fresh; re-running
    // the whole bootstrap on every route change would put a blocking await in
    // front of every click.
    shouldRevalidate: () => false,
    hydrateFallbackElement: <FirstFrame />,
    ErrorBoundary: ShellRouteError,
    children: [
      ...routes.filter((route) => route.scope !== 'public' && !route.shell).map(manifestRoute),
      {
        element: <ApplicationRouteLayout />,
        children: [
          {
            // Pathless and element-less: a screen's render error replaces only
            // the screen, so the shell's navigation and sign-out remain.
            ErrorBoundary: ScreenError,
            children: [
              ...routes.filter((route) => route.shell).map(manifestRoute),
              { path: '*', element: <NotFoundScreen /> },
            ],
          },
        ],
      },
    ],
  },
];
