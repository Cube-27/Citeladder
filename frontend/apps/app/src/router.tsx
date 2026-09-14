import { createBrowserRouter } from 'react-router-dom';

import { LoginRoute, RegisterRoute } from './auth-routes';
import {
  ApplicationRouteLayout,
  OnboardingRoute,
  PrivateRouteLayout,
  ProjectsRoute,
} from './private-routes';

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
            lazy: () =>
              import('./product-routes-site-issues').then(({ WebsiteRoute }) => ({
                Component: WebsiteRoute,
              })),
          },
          {
            path: '/site/crawls/:crawlId/pages/:siteUrlId',
            lazy: () =>
              import('./product-routes-site-issues').then(({ WebsitePageDetailRoute }) => ({
                Component: WebsitePageDetailRoute,
              })),
          },
          {
            path: '/issues',
            lazy: () =>
              import('./product-routes-site-issues').then(({ IssuesRoute }) => ({
                Component: IssuesRoute,
              })),
          },
          {
            path: '/demand',
            lazy: () =>
              import('./product-routes-demand-performance').then(({ DemandRoute }) => ({
                Component: DemandRoute,
              })),
          },
          {
            path: '/performance',
            lazy: () =>
              import('./product-routes-demand-performance').then(({ PerformanceRoute }) => ({
                Component: PerformanceRoute,
              })),
          },
          {
            path: '/opportunities',
            lazy: () =>
              import('./product-routes-opportunity-visibility-runs').then(
                ({ OpportunitiesRouteElement }) => ({
                  Component: OpportunitiesRouteElement,
                }),
              ),
          },
          {
            path: '/visibility',
            lazy: () =>
              import('./product-routes-opportunity-visibility-runs').then(
                ({ VisibilityRouteElement }) => ({
                  Component: VisibilityRouteElement,
                }),
              ),
          },
          {
            path: '/runs',
            lazy: () =>
              import('./product-routes-opportunity-visibility-runs').then(
                ({ RunsRouteElement }) => ({
                  Component: RunsRouteElement,
                }),
              ),
          },
          {
            path: '/runs/:runId',
            lazy: () =>
              import('./product-routes-opportunity-visibility-runs').then(
                ({ RunDetailRouteElement }) => ({
                  Component: RunDetailRouteElement,
                }),
              ),
          },
          {
            path: '/prompts',
            lazy: () =>
              import('./product-routes-prompts-content-commerce-referrals').then(
                ({ PromptsRouteElement }) => ({
                  Component: PromptsRouteElement,
                }),
              ),
          },
          {
            path: '/content',
            lazy: () =>
              import('./product-routes-prompts-content-commerce-referrals').then(
                ({ ContentRouteElement }) => ({
                  Component: ContentRouteElement,
                }),
              ),
          },
          {
            path: '/products',
            lazy: () =>
              import('./product-routes-prompts-content-commerce-referrals').then(
                ({ ProductsRouteElement }) => ({
                  Component: ProductsRouteElement,
                }),
              ),
          },
          {
            path: '/ai-referrals',
            lazy: () =>
              import('./product-routes-prompts-content-commerce-referrals').then(
                ({ AiReferralsRouteElement }) => ({
                  Component: AiReferralsRouteElement,
                }),
              ),
          },
          {
            path: '/settings',
            lazy: () =>
              import('./product-routes-settings-invitations').then(({ SettingsRouteElement }) => ({
                Component: SettingsRouteElement,
              })),
          },
          {
            path: '/invitations/accept',
            lazy: () =>
              import('./product-routes-settings-invitations').then(
                ({ AcceptInvitationRouteElement }) => ({
                  Component: AcceptInvitationRouteElement,
                }),
              ),
          },
        ],
      },
    ],
  },
]);
