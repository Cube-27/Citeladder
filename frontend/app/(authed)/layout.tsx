'use client';

import { Suspense, type ReactNode } from 'react';

import { SessionGuard } from '@/lib/auth/session-guard';
import { ShellFallback } from '@/components/layout/shell-fallback';
import { EntitlementProvider } from '@/lib/billing/entitlement-context';
import { ProjectProvider } from '@/lib/project/project-context';

/**
 * The one authenticated provider lifetime.
 *
 * `(app)` and `(onboarding)` each used to mount their OWN `ProjectProvider`
 * and `EntitlementProvider`. Crossing between them — which is exactly what
 * finishing onboarding does — therefore destroyed the context that held the
 * just-created project and built a new one from scratch, against a project
 * list fetched before that project existed. The new provider read its own
 * empty list as "this account has no projects" and sent the user back to
 * onboarding, where creating the project a second time was refused because
 * the first one had been there all along.
 *
 * Hoisting both providers here is the fix: the selection is made and read
 * inside ONE provider lifetime, so no hand-off across a route-group boundary
 * has to be reconstructed from storage.
 *
 * The Suspense boundary sits ABOVE the provider because the provider reads
 * `useSearchParams` (`?project=`, `?workspace=`) — Next.js requires the
 * boundary above the component that calls it, not merely somewhere in the
 * child layout, or a production build fails the route.
 *
 * The provider stays OUTSIDE `SessionGuard` for the reason it always did: its
 * reads need only the session cookie, so they load alongside `me` instead of
 * after it. The guard still decides what RENDERS — nothing protected mounts
 * until `me` settles, and a 401 from either request clears the session once.
 */
export default function AuthedLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <ProjectProvider>
        <SessionGuard fallback={<ShellFallback />}>
          <EntitlementProvider>{children}</EntitlementProvider>
        </SessionGuard>
      </ProjectProvider>
    </Suspense>
  );
}
