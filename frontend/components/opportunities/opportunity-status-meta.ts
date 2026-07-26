import type { StatusValue } from '@/components/ui/badge-variants';
import type { OpportunityStatus } from '@/lib/api/types';

/**
 * Workflow-status presentation meta — the SINGLE label + palette source for
 * every status control on the surface (drawer badge/footer, catalog filter
 * chips, catalog row dropdown). Insertion order is the display order.
 * Mockup palette: open=info, in-progress=warning, resolved=success.
 *
 * A data module rather than a constant inside `evidence-drawer.tsx`: two
 * component files read it, and a component module that also exports plain
 * values loses Fast Refresh state preservation on every edit.
 */
export const OPPORTUNITY_STATUS_META: Record<
  OpportunityStatus,
  { label: string; badge: StatusValue | 'neutral' }
> = {
  open: { label: 'Open', badge: 'info' },
  in_progress: { label: 'In progress', badge: 'warning' },
  dismissed: { label: 'Dismissed', badge: 'neutral' },
  resolved: { label: 'Resolved', badge: 'success' },
};
