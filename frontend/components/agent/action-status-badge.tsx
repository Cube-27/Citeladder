import { StatusMark } from '@/components/ui/status-mark';
import { ACTION_STATUS_LABEL, ACTION_STATUS_TONE } from '@/lib/agent/vocabulary';
import type { ActionStatus } from '@/lib/api/actions';

export function ActionStatusBadge({ status }: Readonly<{ status: ActionStatus }>) {
  const tone = ACTION_STATUS_TONE[status];
  const label = ACTION_STATUS_LABEL[status];
  return <StatusMark tone={tone}>{label}</StatusMark>;
}
