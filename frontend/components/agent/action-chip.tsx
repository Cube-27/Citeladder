import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import { RecordTag } from '@/components/ui/tag';
import type { AgentChatDetail } from '@/lib/api/agent';

type ChatAction = AgentChatDetail['actions'][number];

/** An Action named in a chat: its title and current status, linking to its page. */
export function ActionChip({
  action,
  prefix = '',
}: Readonly<{ action: ChatAction; prefix?: string }>) {
  return (
    <RecordTag
      href={`/agent/actions/${action.id}`}
      label={`${prefix}${action.target_label}`}
      status={<ActionStatusBadge status={action.status} />}
    />
  );
}
