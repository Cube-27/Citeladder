import { Suspense, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { AppScrollRestoration } from '@/components/layout/app-scroll-restoration';
import { AppShell } from '@/components/layout/app-shell';
import { FirstFrame, HeldContent } from '@/components/layout/first-frame';
import { OnboardingGate } from '@/components/layout/onboarding-gate';
import { RouteLoadingScreen } from '@/components/layout/page-shell';
import { UserMenuController } from '@/components/layout/user-menu';
import { ToastProvider } from '@/components/ui/toast';
import { SessionGuard } from '@/lib/auth/session-guard';
import { PolicyAcceptanceGate } from '@/components/auth/policy-acceptance';
import { EntitlementProvider } from '@/lib/billing/entitlement-context';
import { isFlowPath } from '@/lib/navigation/app-routes';
import { ProjectProvider } from '@/lib/project/project-context';
import { useEngineCatalog } from '@/lib/providers/engines';
import { WorkspaceAccessGate } from '@/components/auth/workspace-access-gate';

export function PrivateRouteLayout() {
  useEngineCatalog();
  const flow = isFlowPath(useLocation().pathname ?? '');
  return (
    <Suspense fallback={<FirstFrame />}>
      <ProjectProvider>
        <SessionGuard fallback={sessionFallback}>
          <WorkspaceAccessGate>
            <PolicyAcceptanceGate>
              <EntitlementProvider>
                <UserMenuController>
                  {flow ? (
                    <HeldContent frame={<FirstFrame />}>
                      <Outlet />
                    </HeldContent>
                  ) : (
                    <Outlet />
                  )}
                </UserMenuController>
              </EntitlementProvider>
            </PolicyAcceptanceGate>
          </WorkspaceAccessGate>
        </SessionGuard>
      </ProjectProvider>
    </Suspense>
  );
}

function sessionFallback(content?: ReactNode) {
  return <FirstFrame>{content}</FirstFrame>;
}

export function ApplicationRouteLayout() {
  return (
    <ToastProvider>
      <AppScrollRestoration />
      <AppShell>
        <HeldContent frame={<RouteLoadingScreen />}>
          <OnboardingGate>
            <Outlet />
          </OnboardingGate>
        </HeldContent>
      </AppShell>
    </ToastProvider>
  );
}
