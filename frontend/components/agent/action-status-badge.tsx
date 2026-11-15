import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import {
  ACTION_STATUS_LABEL,
  ACTION_STATUS_TONE,
  PRIORITY_BAND_LABEL,
  PRIORITY_BAND_VALUE,
} from '@/lib/agent/vocabulary';
import type { ActionPriorityBand, ActionStatus } from '@/lib/api/actions';

/** An Action's workflow status: a labelled state mark, never colour alone. */
export function ActionStatusBadge({ status }: Readonly<{ status: ActionStatus }>) {
  const tone = ACTION_STATUS_TONE[status];
  const label = ACTION_STATUS_LABEL[status];
  return tone === 'neutral' ? (
    <Tag>{label}</Tag>
  ) : (
    <StatusMark variant="status" value={tone}>
      {label}
    </StatusMark>
  );
}

/** An Action's priority as High, Medium or Low; an unscored Action says so. */
export function ActionPriorityBadge({ band }: Readonly<{ band: ActionPriorityBand | null }>) {
  if (band === null) return <Tag>Not scored</Tag>;
  return (
    <StatusMark variant="priority" value={PRIORITY_BAND_VALUE[band]}>
      {PRIORITY_BAND_LABEL[band]}
    </StatusMark>
  );
}
