'use client';

import { Suspense } from 'react';

import { PageShell } from '@/components/layout/page-shell';

import { AcceptInvitationScreen } from './accept-invitation-screen';
import { SettingsScreen } from './settings-screen';

/** Shared authenticated settings route, including URL-backed settings tabs. */
export function SettingsRouteContent() {
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
