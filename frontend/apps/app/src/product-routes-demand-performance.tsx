import { DemandProjection } from '@/components/demand/demand-projection';
import { PageHeader } from '@/components/layout/page-header';
import { PerformanceScreen } from '@/components/performance/performance-screen';

/** `/demand` authenticated application leaf. */
export function DemandRoute() {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <DemandProjection />
    </div>
  );
}

/** `/performance` authenticated application leaf. */
export function PerformanceRoute() {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <PerformanceScreen />
    </div>
  );
}
