import { OpportunityKvRow } from '@/components/opportunities/opportunity-kv-row';
import { Label } from '@/components/ui/typography';
import type { OpportunityDetail } from '@/lib/api/types';
import { formatAudited } from '@/lib/site-health/status';

export function OpportunitySummarySection({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  return (
    <section className="grid gap-2">
      <Label>Source</Label>
      <div className="divide-border-subtle divide-y">
        <OpportunityKvRow label="Detected" value={formatAudited(detail.created_at)} />
      </div>
    </section>
  );
}
