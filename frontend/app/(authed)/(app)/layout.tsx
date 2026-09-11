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
 * The gate sits outside the SHELL so the session wait and the workspace wait
 * are covered by the same loader in the same place: the reader sees one
 * loader rather than a viewport loader replaced by a content-pane loader a
 * moment later, and what follows it is the finished shell.
 */
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ProductTourProvider>
      <ToastProvider>
        <OnboardingGate>
          <AppShell>{children}</AppShell>
        </OnboardingGate>
      </ToastProvider>
    </ProductTourProvider>
  );
}
