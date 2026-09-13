import { createBrowserRouter } from 'react-router-dom';

import { LoginRoute, RegisterRoute } from './auth-routes';
import {
  ApplicationRouteLayout,
  OnboardingRoute,
  PrivateRouteLayout,
  ProjectsRoute,
} from './private-routes';
import { DemandRoute, PerformanceRoute } from './product-routes-demand-performance';
import { IssuesRoute, WebsitePageDetailRoute, WebsiteRoute } from './product-routes-site-issues';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginRoute />,
  },
  {
    path: '/register',
    element: <RegisterRoute />,
  },
  {
    element: <PrivateRouteLayout />,
    children: [
      {
        path: '/onboarding',
        element: <OnboardingRoute />,
      },
      {
        element: <ApplicationRouteLayout />,
        children: [
          {
            path: '/projects',
            element: <ProjectsRoute />,
          },
          {
            path: '/site',
            element: <WebsiteRoute />,
          },
          {
            path: '/site/crawls/:crawlId/pages/:siteUrlId',
            element: <WebsitePageDetailRoute />,
          },
          {
            path: '/issues',
            element: <IssuesRoute />,
          },
          {
            path: '/demand',
            element: <DemandRoute />,
          },
          {
            path: '/performance',
            element: <PerformanceRoute />,
          },
        ],
      },
    ],
  },
]);
