import { StatusMark } from '@/components/ui/status-mark';
import { ACTION_STATUS_LABEL, ACTION_STATUS_TONE } from '@/lib/agent/vocabulary';
import type { ActionStatus } from '@/lib/api/actions';

/** An Action's workflow status: a labelled state mark, never colour alone. */
export function ActionStatusBadge({ status }: Readonly<{ status: ActionStatus }>) {
  const tone = ACTION_STATUS_TONE[status];
  const label = ACTION_STATUS_LABEL[status];
  // New and Declined are the neutral tone: the well fill and its plain glyph.
  return tone === 'neutral' ? (
    <StatusMark tone="neutral">{label}</StatusMark>
  ) : (
    <StatusMark variant="status" value={tone}>
      {label}
    </StatusMark>
  );
}
