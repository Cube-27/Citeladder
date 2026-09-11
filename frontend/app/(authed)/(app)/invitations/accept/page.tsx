'use client';

import { Suspense } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { AcceptInvitationScreen } from '@/components/settings/accept-invitation-screen';

/**
 * Invitation acceptance.
 *
 * A workspace-only route: the arriving reader has not joined anything yet, so
 * the project gate must not send them into project creation first. The token
 * comes from the URL, which means this screen reads `useSearchParams` and
 * sits under `<Suspense>` per Next's CSR-bailout requirement.
 */
export default function AcceptInvitationPage() {
  return (
    <Suspense>
      <PageHeader />
      <AcceptInvitationScreen />
    </Suspense>
  );
}
