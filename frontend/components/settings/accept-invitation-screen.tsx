import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';

import { UserMenuTrigger } from '@/components/layout/user-menu';
import { FlowBlock, FlowPage } from '@/components/templates/flow-page';
import { Button } from '@/components/ui/button';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { workspaceMutations } from '@/lib/api/workspaces';
import { useSelectWorkspace } from '@/lib/navigation/project-destination';
import { Notice } from '@/components/ui/notice';

/** `/invitations/accept`: the acceptance as a Flow page, before the shell opens. */
export function AcceptInvitationPage() {
  return (
    <FlowPage label="Invitation" barEnd={<UserMenuTrigger presenter="compact" />}>
      <AcceptInvitationScreen />
    </FlowPage>
  );
}

/**
 * Accept an invitation into somebody else's workspace.
 *
 * Acceptance is bound to the signed-in identity: the server refuses a token
 * addressed to a different email, an expired one, a revoked one, and one that
 * never existed, all with the same refusal — so this screen cannot tell the
 * reader which it was, and does not try to.
 *
 * On success the new workspace becomes the selection through the shared
 * navigation owner, so the context, the stored selection and the URL agree
 * about where the reader now is.
 */
export function AcceptInvitationScreen() {
  const router = useNavigate();
  const searchParams = useSearchParams()[0];
  const selectWorkspace = useSelectWorkspace();
  const token = searchParams?.get('token') ?? '';
  // One attempt per token. A re-render must not re-post it, and the server's
  // repeated-acceptance path is inert anyway.
  const attempted = useRef<string | null>(null);

  const accept = useMutation(workspaceMutations.acceptInvitation());
  const { mutate } = accept;

  useEffect(() => {
    if (!token || attempted.current === token) return;
    attempted.current = token;
    mutate(token, { onSuccess: (workspace) => selectWorkspace(workspace.id, '/projects') });
  }, [mutate, selectWorkspace, token]);

  if (!token) {
    return (
      <FlowBlock
        title="This invitation link is incomplete"
        sub="This link is missing its invitation token."
      >
        <Notice tone="negative">
          Open the invitation link exactly as it was sent to you, or ask for a new one.
        </Notice>
      </FlowBlock>
    );
  }

  return (
    <FlowBlock
      title="Joining workspace"
      sub="Invitations are single-use and expire, and they only work for the address they were sent to."
    >
      {accept.isError ? (
        <RefusedInvitation error={accept.error} onLeave={() => router('/projects')} />
      ) : (
        <Notice tone="info">
          {accept.isSuccess
            ? 'You have joined. Taking you there now.'
            : 'Checking your invitation.'}
        </Notice>
      )}
    </FlowBlock>
  );
}

/**
 * Why the invitation did not work, in a sentence, and the way on. A refusal
 * never says which of its causes it was; a code is support detail only.
 */
function RefusedInvitation({ error, onLeave }: Readonly<{ error: unknown; onLeave: () => void }>) {
  const notice = mutationNoticeForError(error, { action: 'accept this invitation' });
  const reference = [notice.code, notice.requestId].filter(Boolean).join(' · ');
  return (
    <Notice
      tone="negative"
      title={notice.retryable ? "Couldn't accept this invitation" : "This invitation can't be used"}
      action={
        <Button type="button" variant="secondary" onClick={onLeave}>
          Go to your workspace
        </Button>
      }
    >
      <p>
        {notice.retryable
          ? notice.message
          : 'It has expired, was already used or revoked, or was sent to a different email address. Ask the person who invited you for a new link.'}
      </p>
      {reference ? <p className="type-data-sm text-ink-2">{reference}</p> : null}
    </Notice>
  );
}
