import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import type { AgentWriteFailure } from '@/lib/agent/errors';
import { useManagedPlan } from '@/lib/billing/entitlement-context';

/**
 * A refused Agent write: what happened in words, and the step that fixes it.
 * No credits and no model offers a model to connect, or Billing on a managed
 * plan, which has no provider settings (B32). `newChatHref` is where a chat
 * at its turn limit continues; without it no new-chat step is offered.
 */
export function AgentFailureNotice({
  failure,
  newChatHref,
  onRetry,
}: Readonly<{ failure: AgentWriteFailure; newChatHref?: string; onRetry?: () => void }>) {
  const managed = useManagedPlan();
  return (
    <Notice
      kind="mutation"
      notice={failure}
      onRetry={onRetry}
      recovery={recoveryLink(failure, managed, newChatHref)}
    />
  );
}

function recoveryLink(
  failure: AgentWriteFailure,
  managed: boolean,
  newChatHref: string | undefined,
) {
  switch (failure.recovery) {
    case 'new-chat':
      return newChatHref ? <TextLink href={newChatHref}>Start a new chat</TextLink> : null;
    case 'connect-model':
      return managed ? (
        <TextLink href="/billing">Open Billing</TextLink>
      ) : (
        <TextLink href="/settings?tab=providers">Connect a model</TextLink>
      );
    case null:
      return null;
    default: {
      const unreachable: never = failure.recovery;
      return unreachable;
    }
  }
}
