import { type ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { OnboardingGate } from '@/components/layout/onboarding-gate';
import { ProductTourProvider } from '@/components/tour/product-tour-provider';
import { ToastProvider } from '@/components/ui/toast';

/** Validate that the authenticated shell can render immediately on navigation. */
export const instant = true;

/**
 * Application-shell layout.
 *
 * Session, project/workspace context and entitlements are owned one level up
 * by `app/(authed)/layout.tsx` and shared with `(onboarding)`. What remains
 * here is the chrome that only the application has: the tour, toasts, the
 * project-route gate, and the shell itself.
 *
 * The shell mounts as soon as the session is authenticated. Project and
 * entitlement resolution then happens in its content pane, keeping the
 * account and workspace recovery controls stable through that transition.
 */
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ProductTourProvider>
      <ToastProvider>
        <AppShell>
          <OnboardingGate>{children}</OnboardingGate>
        </AppShell>
      </ToastProvider>
    </ProductTourProvider>
  );
}
