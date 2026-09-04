'use client';

import { PerformanceScreen } from '@/components/performance/performance-screen';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Performance — the Search Console-aligned view of organic search: the four
 * GSC metrics for a resolved range and its optional comparison period, one
 * combined chart, a compact GA4 summary, and the six keyset breakdown tables
 * (queries, pages, countries, devices, search appearance, days).
 *
 * Everything renders persisted projections resolved server-side, so the dates
 * shown are always the dates actually covered. The page title renders in the
 * top bar, so there is no in-page header block.
 */
export default function PerformancePage() {
  return (
    <TooltipProvider>
      <div className="grid gap-[var(--workspace-gap)]">
        <PerformanceScreen />
      </div>
    </TooltipProvider>
  );
}
