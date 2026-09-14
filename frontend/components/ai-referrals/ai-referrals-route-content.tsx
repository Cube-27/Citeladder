'use client';

import { PageHeader } from '@/components/layout/page-header';

import { AiReferralsScreen } from './ai-referrals-screen';

/** Shared /ai-referrals route content. */
export function AiReferralsRouteContent() {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <AiReferralsScreen />
    </div>
  );
}
