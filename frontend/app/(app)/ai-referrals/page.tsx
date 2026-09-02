'use client';

import { AiReferralsScreen } from '@/components/ai-referrals/ai-referrals-screen';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function AiReferralsPage() {
  return (
    <TooltipProvider>
      <AiReferralsScreen />
    </TooltipProvider>
  );
}
