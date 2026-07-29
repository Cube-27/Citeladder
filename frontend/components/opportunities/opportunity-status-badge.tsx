import { Badge } from '@/components/ui/badge';
import { OPPORTUNITY_STATUS_META } from '@/components/opportunities/opportunity-status-meta';
import type { OpportunityStatus } from '@/lib/api/types';

export function OpportunityStatusBadge({ status }: Readonly<{ status: OpportunityStatus }>) {
  const meta = OPPORTUNITY_STATUS_META[status];
  if (meta.badge === 'neutral') return <Badge>{meta.label}</Badge>;
  return (
    <Badge variant="status" value={meta.badge}>
      {meta.label}
    </Badge>
  );
}
