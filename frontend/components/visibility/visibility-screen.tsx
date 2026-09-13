'use client';

import { PageHeader } from '@/components/layout/page-header';
import { VisibilityDashboard } from '@/components/visibility/visibility-dashboard';

/** Visibility workspace chrome around its active-project dashboard. */
export function VisibilityScreen() {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <VisibilityDashboard />
    </div>
  );
}
