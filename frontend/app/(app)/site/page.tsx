'use client';

import Link from 'next/link';

import { SiteHealthScreen } from '@/components/site-health/site-health-screen';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Site Intelligence owns one six-panel workspace. `SiteHealthScreen` supplies
 * the existing Pages lifecycle as the Pages panel and the intelligence
 * projection supplies Overview, Knowledge, Schema, Journeys, and Evidence.
 * Keeping that composition here avoids a second, competing route-level tab
 * row over the same content.
 */
export default function SitePage() {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <SiteHealthScreen />
        <Link
          href="/agent?task=build_roadmap&objective=Build%20a%20roadmap%20from%20the%20current%20Site%20evidence."
          className="text-accent-text self-start text-sm font-medium underline-offset-2 hover:underline"
        >
          Build a roadmap with the Growth Agent
        </Link>
      </div>
    </TooltipProvider>
  );
}
