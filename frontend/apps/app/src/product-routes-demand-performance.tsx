import { DemandProjection } from '@/components/demand/demand-projection';
import { PerformanceScreen } from '@/components/performance/performance-screen';

/** `/demand` authenticated application leaf. */
export function DemandRoute() {
  return <DemandProjection />;
}

/** `/performance` authenticated application leaf. */
export function PerformanceRoute() {
  return <PerformanceScreen />;
}
