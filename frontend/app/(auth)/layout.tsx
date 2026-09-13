import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthRouteShell } from '@/components/auth/auth-route-shell';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Auth and onboarding share one focused light-ground flow shell.
 */
export default async function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  'use cache';

  return <AuthRouteShell>{children}</AuthRouteShell>;
}
