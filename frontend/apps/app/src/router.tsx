import { lazy, Suspense, type ComponentType } from 'react';
import { redirect, type RouteObject } from 'react-router-dom';

import { PageLoading } from '@/components/layout/page-loading';
import { ShellFallback } from '@/components/layout/shell-fallback';
import { bootstrapPrivateRoutes } from '@/lib/project/bootstrap-loader';
import { RouteError } from './route-error';
import { ApplicationRouteLayout, PrivateRouteLayout, ProjectsRoute } from './private-routes';

/**
 * Begin the route download at matching time, alongside session bootstrap.
 * The loader never waits for it; Suspense owns only the route content pane.
 */
function productRoute(
  path: string,
  importRoute: () => Promise<{ default: ComponentType }>,
): RouteObject {
  let module: ReturnType<typeof importRoute> | undefined;
  const load = () => (module ??= importRoute());
  const Screen = lazy(load);
  return {
    path,
    loader: () => {
      // React.lazy surfaces any failure through RouteError when the leaf mounts.
      void load().catch(() => {});
      return null;
    },
    element: (
      <Suspense fallback={<PageLoading />}>
        <Screen />
      </Suspense>
    ),
  };
}

export const appRoutes: RouteObject[] = [
  { path: '/', loader: () => redirect('/projects') },
  {
    ...productRoute('/login', () =>
      import('./auth-routes').then(({ LoginRoute }) => ({ default: LoginRoute })),
    ),
    ErrorBoundary: RouteError,
  },
  {
    ...productRoute('/register', () =>
      import('./auth-routes').then(({ RegisterRoute }) => ({ default: RegisterRoute })),
    ),
    ErrorBoundary: RouteError,
  },
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
    hydrateFallbackElement: <ShellFallback />,
    ErrorBoundary: RouteError,
    children: [
      productRoute('/onboarding', () =>
        import('@/components/onboarding/onboarding-page-client').then(
          ({ OnboardingPageClient }) => ({
            default: OnboardingPageClient,
          }),
        ),
      ),
      {
        element: <ApplicationRouteLayout />,
        children: [
          productRoute('/pricing', () => import('./pricing-route')),
          { path: '/projects', element: <ProjectsRoute /> },
          productRoute('/site', () =>
            import('./product-routes-site-issues').then(({ WebsiteRoute }) => ({
              default: WebsiteRoute,
            })),
          ),
          productRoute('/site/crawls/:crawlId/pages/:siteUrlId', () =>
            import('./product-routes-site-issues').then(({ WebsitePageDetailRoute }) => ({
              default: WebsitePageDetailRoute,
            })),
          ),
          productRoute('/issues', () =>
            import('./product-routes-site-issues').then(({ IssuesRoute }) => ({
              default: IssuesRoute,
            })),
          ),
          productRoute('/demand', () =>
            import('./product-routes-demand-performance').then(({ DemandRoute }) => ({
              default: DemandRoute,
            })),
          ),
          productRoute('/search-intelligence', () =>
            import('./product-routes-demand-performance').then(({ SearchIntelligenceRoute }) => ({
              default: SearchIntelligenceRoute,
            })),
          ),
          productRoute('/performance', () =>
            import('./product-routes-demand-performance').then(({ PerformanceRoute }) => ({
              default: PerformanceRoute,
            })),
          ),
          // The retired Opportunities screen: old links land on Actions.
          {
            path: '/opportunities',
            loader: ({ request }) => redirect(`/agent/actions${new URL(request.url).search}`),
          },
          productRoute('/agent', () =>
            import('./product-routes-agent').then(({ NewChatRouteElement }) => ({
              default: NewChatRouteElement,
            })),
          ),
          productRoute('/agent/chats/:chatId', () =>
            import('./product-routes-agent').then(({ ChatRouteElement }) => ({
              default: ChatRouteElement,
            })),
          ),
          productRoute('/agent/actions', () =>
            import('./product-routes-agent').then(({ ActionsRouteElement }) => ({
              default: ActionsRouteElement,
            })),
          ),
          productRoute('/agent/actions/:actionId', () =>
            import('./product-routes-agent').then(({ ActionDetailRouteElement }) => ({
              default: ActionDetailRouteElement,
            })),
          ),
          productRoute('/agent/skills', () =>
            import('./product-routes-agent').then(({ SkillsRouteElement }) => ({
              default: SkillsRouteElement,
            })),
          ),
          productRoute('/agent/context', () =>
            import('./product-routes-agent').then(({ ContextRouteElement }) => ({
              default: ContextRouteElement,
            })),
          ),
          productRoute('/visibility', () =>
            import('./product-routes-visibility-runs').then(({ VisibilityRouteElement }) => ({
              default: VisibilityRouteElement,
            })),
          ),
          productRoute('/runs', () =>
            import('./product-routes-visibility-runs').then(({ RunsRouteElement }) => ({
              default: RunsRouteElement,
            })),
          ),
          productRoute('/runs/:runId', () =>
            import('./product-routes-visibility-runs').then(({ RunDetailRouteElement }) => ({
              default: RunDetailRouteElement,
            })),
          ),
          productRoute('/prompts', () =>
            import('./product-routes-prompts-commerce-referrals').then(
              ({ PromptsRouteElement }) => ({ default: PromptsRouteElement }),
            ),
          ),
          productRoute('/products', () =>
            import('./product-routes-prompts-commerce-referrals').then(
              ({ ProductsRouteElement }) => ({ default: ProductsRouteElement }),
            ),
          ),
          productRoute('/ai-referrals', () =>
            import('./product-routes-prompts-commerce-referrals').then(
              ({ AiReferralsRouteElement }) => ({ default: AiReferralsRouteElement }),
            ),
          ),
          productRoute('/settings', () =>
            import('./product-routes-settings-invitations').then(({ SettingsRouteElement }) => ({
              default: SettingsRouteElement,
            })),
          ),
          productRoute('/billing', () =>
            import('./product-routes-settings-invitations').then(({ BillingRouteElement }) => ({
              default: BillingRouteElement,
            })),
          ),
          productRoute('/invitations/accept', () =>
            import('./product-routes-settings-invitations').then(
              ({ AcceptInvitationRouteElement }) => ({ default: AcceptInvitationRouteElement }),
            ),
          ),
        ],
      },
    ],
  },
];
