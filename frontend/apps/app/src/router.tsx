import { createBrowserRouter } from 'react-router-dom';

import { LoginRoute, RegisterRoute } from './auth-routes';
import {
  ApplicationRouteLayout,
  OnboardingRoute,
  PrivateRouteLayout,
  ProjectsRoute,
} from './private-routes';
import { DemandRoute, PerformanceRoute } from './product-routes-demand-performance';
import {
  OpportunitiesRouteElement,
  RunDetailRouteElement,
  RunsRouteElement,
  VisibilityRouteElement,
} from './product-routes-opportunity-visibility-runs';
import {
  AiReferralsRouteElement,
  ContentRouteElement,
  ProductsRouteElement,
  PromptsRouteElement,
} from './product-routes-prompts-content-commerce-referrals';
import {
  AcceptInvitationRouteElement,
  SettingsRouteElement,
} from './product-routes-settings-invitations';
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
          {
            path: '/opportunities',
            element: <OpportunitiesRouteElement />,
          },
          {
            path: '/visibility',
            element: <VisibilityRouteElement />,
          },
          {
            path: '/runs',
            element: <RunsRouteElement />,
          },
          {
            path: '/runs/:runId',
            element: <RunDetailRouteElement />,
          },
          {
            path: '/prompts',
            element: <PromptsRouteElement />,
          },
          {
            path: '/content',
            element: <ContentRouteElement />,
          },
          {
            path: '/products',
            element: <ProductsRouteElement />,
          },
          {
            path: '/ai-referrals',
            element: <AiReferralsRouteElement />,
          },
          {
            path: '/settings',
            element: <SettingsRouteElement />,
          },
          {
            path: '/invitations/accept',
            element: <AcceptInvitationRouteElement />,
          },
        ],
      },
    ],
  },
]);
