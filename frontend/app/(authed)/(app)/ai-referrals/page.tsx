'use client';

import { AiReferralsScreen } from '@/components/ai-referrals/ai-referrals-screen';
import { PageHeader } from '@/components/layout/page-header';

export default function AiReferralsPage() {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <AiReferralsScreen />
    </div>
  );
}
