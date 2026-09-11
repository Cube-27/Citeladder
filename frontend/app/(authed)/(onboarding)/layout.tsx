import type { ReactNode } from 'react';

/**
 * Onboarding is authenticated but deliberately has no application shell.
 *
 * Session, project/workspace context and entitlements all come from
 * `app/(authed)/layout.tsx`, which this group now shares with `(app)`. It
 * mounts no provider of its own: a second `ProjectProvider` here is what made
 * the selection this screen commits die at the route-group boundary.
 */
export default function OnboardingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
