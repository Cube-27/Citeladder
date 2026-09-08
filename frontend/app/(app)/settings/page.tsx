'use client';

import { Suspense } from 'react';

import { SettingsScreen } from '@/components/settings/settings-screen';
import { PageHeader } from '@/components/layout/page-header';

/**
 * Settings page — tabbed settings reachable from the sidebar user dropdown:
 * Account (read-only session details + appearance), Provider Settings (BYOK
 * provider configuration), and Danger Zone (project
 * deletion). The page title renders in the top bar (F5).
 *
 * `<SettingsScreen>` reads `useSearchParams` (deep-linkable `?tab=`), so it
 * sits under `<Suspense>` per Next's CSR-bailout requirement.
 */
export default function SettingsPage() {
  return (
    <Suspense>
      <PageHeader />
      <SettingsScreen />
    </Suspense>
  );
}
