import { Suspense, type ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { OnboardingGate } from '@/components/layout/onboarding-gate';
import { ShellFallback } from '@/components/layout/shell-fallback';
import { SessionGuard } from '@/lib/auth/session-guard';
import { EntitlementProvider } from '@/lib/billing/entitlement-context';
import { ProjectProvider } from '@/lib/project/project-context';
import { ProductTourProvider } from '@/components/tour/product-tour-provider';
import { ToastProvider } from '@/components/ui/toast';

/** Validate that the authenticated shell can render immediately on navigation. */
export const instant = true;

/**
 * Authed-area layout (F5).
 *
 * Wraps every `(app)` route in the F5 `<ProjectProvider>` (active-project
 * context + `X-Workspace-Id` header wiring), then F4's `<SessionGuard>`
 * (bounces unauthenticated visitors to `/login` and installs the 401
 * watchdog), then `<OnboardingGate>` (first-run users have no project yet, so
 * they go to `/onboarding` rather than into an empty workspace), then the
 * `<AppShell>` chrome (sidebar + top bar). `/` is now the public marketing
 * page (see `app/(marketing)/`); its LandingSessionRedirect island forwards
 * signed-in visitors here (`/projects`, or `/onboarding` pre-project).
 *
 * The provider sits OUTSIDE the guard on purpose. Its project list needs only
 * the session cookie — the workspace header is derived from its own result —
 * so it can load alongside `me` instead of waiting for it, and a cold entry
 * pays one round trip before the shell rather than two in series. The guard
 * still owns what is rendered: nothing protected mounts until `me` settles,
 * and a 401 from either request clears the session and redirects once.
 */
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ProjectProvider>
      <SessionGuard fallback={<ShellFallback />}>
        <Suspense fallback={<ShellFallback />}>
          <ProductTourProvider>
            <EntitlementProvider>
              <ToastProvider>
                {/* The shell wraps the gate, not the other way round. Mounted
                    here it paints ONCE — the project wait, the onboarding
                    redirect, and every screen's first load all resolve inside
                    the content pane instead of each replacing the whole
                    viewport with a placeholder of its own. */}
                <AppShell>
                  <OnboardingGate>{children}</OnboardingGate>
                </AppShell>
              </ToastProvider>
            </EntitlementProvider>
          </ProductTourProvider>
        </Suspense>
      </SessionGuard>
    </ProjectProvider>
  );
}
