import { useMutation } from '@tanstack/react-query';
import { Link2Off } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';

import { UserMenuTrigger } from '@/components/layout/user-menu';
import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { FlowBlock, FlowPage } from '@/components/templates/flow-page';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { StateBlock } from '@/components/ui/state-block';
import { textRole } from '@/components/ui/typography';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { workspaceMutations } from '@/lib/api/workspaces';
import { useSelectWorkspace } from '@/lib/navigation/project-destination';

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

  const leave = () => router('/projects');

  if (!token) {
    return (
      <InvitationDeadEnd
        heading="This invitation link is incomplete"
        description="Ask for a new link."
        onLeave={leave}
      />
    );
  }

  // The outcome replaces "Checking" in place, so a live region announces it.
  return (
    <div aria-live="polite">
      {accept.isError ? (
        <RefusedInvitation error={accept.error} onLeave={leave} />
      ) : (
        <InvitationProgress joined={accept.isSuccess} />
      )}
    </div>
  );
}

function InvitationProgress({ joined }: Readonly<{ joined: boolean }>) {
  return joined ? (
    <FlowBlock title="You have joined" />
  ) : (
    <FlowBlock title="Checking your invitation" />
  );
}

/**
 * A refusal never says which of its causes it was (expired, used, revoked or
 * another address), so the heading does not guess. Its code is reference
 * text under the way on, never the headline.
 */
function RefusedInvitation({ error, onLeave }: Readonly<{ error: unknown; onLeave: () => void }>) {
  const notice = mutationNoticeForError(error, { action: 'accept this invitation' });
  const reference = [notice.code, notice.requestId].filter(Boolean).join(' · ');
  return (
    <InvitationDeadEnd
      heading={
        notice.retryable ? "Couldn't accept this invitation" : "This invitation can't be used"
      }
      description={
        notice.retryable
          ? notice.message
          : 'Expired, used, revoked or sent to another address. Ask for a new link.'
      }
      reference={reference}
      onLeave={onLeave}
    />
  );
}

/**
 * Every invitation dead end has one look: the page's state block, one
 * sentence and one way on. The route is workspace-scoped, so the reader is
 * always signed in and the way on is their workspace.
 */
function InvitationDeadEnd({
  heading,
  description,
  reference,
  onLeave,
}: Readonly<{ heading: string; description: string; reference?: string; onLeave: () => void }>) {
  useDocumentTitle(heading);
  return (
    // The flow page's card is the frame, so the state draws none of its own.
    <Stack gap="item" data-section="framed" className="min-w-0 justify-items-center">
      <StateBlock
        kind="empty"
        icon={Link2Off}
        headingLevel={1}
        heading={heading}
        description={description}
        action={
          <Button type="button" onClick={onLeave}>
            Go to your workspace
          </Button>
        }
      />
      {reference ? (
        <p
          className={textRole('caption', 'text-ink-2 max-w-full overflow-x-auto whitespace-nowrap')}
        >
          {`Reference: ${reference}`}
        </p>
      ) : null}
    </Stack>
  );
}
