import { DemandProjection } from '@/components/demand/demand-projection';
import { PageHeader } from '@/components/layout/page-header';

export default function DemandPage() {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <DemandProjection />
    </div>
  );
}
