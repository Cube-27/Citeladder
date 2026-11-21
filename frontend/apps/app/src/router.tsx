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

function manifestRoute(route: AppRouteRecord): RouteObject {
  let module: ReturnType<AppRouteRecord['screen']> | undefined;
  const load = () => (module ??= route.screen());
  registerRouteChunk(route.path, load);
  const Screen = lazy(load);
  return {
    path: route.path,
    loader: () => {
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
    loader: bootstrapPrivateRoutes,
    shouldRevalidate: () => false,
    hydrateFallbackElement: <FirstFrame />,
    ErrorBoundary: ShellRouteError,
    children: [
      ...routes.filter((route) => route.scope !== 'public' && !route.shell).map(manifestRoute),
      {
        element: <ApplicationRouteLayout />,
        children: [
          {
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
