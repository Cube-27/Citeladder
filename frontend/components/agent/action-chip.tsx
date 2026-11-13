import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import { RecordChip } from '@/components/ui/record-chip';
import type { AgentChatDetail } from '@/lib/api/agent';

type ChatAction = AgentChatDetail['actions'][number];

/** An Action named in a chat: its title and current status, linking to its page. */
export function ActionChip({
  action,
  prefix = '',
}: Readonly<{ action: ChatAction; prefix?: string }>) {
  return (
    <RecordChip
      href={`/agent/actions/${action.id}`}
      label={`${prefix}${action.target_label}`}
      mark={<ActionStatusBadge status={action.status} />}
    />
  );
}
