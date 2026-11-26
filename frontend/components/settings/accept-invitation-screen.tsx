import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';

import { UserMenuTrigger } from '@/components/layout/user-menu';
import { useDocumentTitle } from '@/components/layout/use-route-announcement';
import { FlowBlock, FlowPage } from '@/components/templates/flow-page';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { StateBlock } from '@/components/ui/state-block';
import { textRole } from '@/components/ui/typography';
import { Link2Off } from '@/lib/icons';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { workspaceMutations } from '@/lib/api/workspaces';
import { useSelectWorkspace } from '@/lib/navigation/project-destination';
import { useUrlParam } from '@/lib/navigation/url-params';

export function AcceptInvitationPage() {
  return (
    <FlowPage label="Invitation" barEnd={<UserMenuTrigger presenter="compact" />}>
      <AcceptInvitationScreen />
    </FlowPage>
  );
}

export function AcceptInvitationScreen() {
  const router = useNavigate();
  const selectWorkspace = useSelectWorkspace();
  const token = useUrlParam('token') ?? '';
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

function InvitationDeadEnd({
  heading,
  description,
  reference,
  onLeave,
}: Readonly<{ heading: string; description: string; reference?: string; onLeave: () => void }>) {
  useDocumentTitle(heading);
  return (
    <Stack gap="item" className="min-w-0 justify-items-center">
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
