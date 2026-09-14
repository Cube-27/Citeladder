'use client';

import { Suspense } from 'react';

import { PageHeader } from '@/components/layout/page-header';

import { AcceptInvitationScreen } from './accept-invitation-screen';
import { SettingsScreen } from './settings-screen';

/** Shared authenticated settings route, including URL-backed settings tabs. */
export function SettingsRouteContent() {
  return (
    <Suspense>
      <div className="grid gap-[var(--workspace-gap)]">
        <PageHeader />
        <SettingsScreen />
      </div>
    </Suspense>
  );
}

/** Shared workspace-only invitation acceptance route with URL-backed token state. */
export function AcceptInvitationRouteContent() {
  return (
    <Suspense>
      <PageHeader />
      <AcceptInvitationScreen />
    </Suspense>
  );
}
