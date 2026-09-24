'use client';

import { Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { PageShell } from '@/components/layout/page-shell';

import { AcceptInvitationScreen } from './accept-invitation-screen';
import { SettingsScreen } from './settings-screen';

/** Shared authenticated settings route, including URL-backed settings tabs. */
export function SettingsRouteContent() {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  // Billing moved from a settings tab to its own section; keep old links working.
  if (search.get('tab') === 'billing') {
    search.delete('tab');
    const query = search.toString();
    return <Navigate replace to={query ? `/billing?${query}` : '/billing'} />;
  }
  return (
    <Suspense>
      <SettingsScreen />
    </Suspense>
  );
}

/** Shared workspace-only invitation acceptance route with URL-backed token state. */
export function AcceptInvitationRouteContent() {
  return (
    <Suspense>
      <PageShell>
        <AcceptInvitationScreen />
      </PageShell>
    </Suspense>
  );
}
