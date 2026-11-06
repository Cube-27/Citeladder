'use client';

import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';

import { ListScreen } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Stack } from '@/components/ui/layout';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { workspaceMutations } from '@/lib/api/workspaces';
import { useSelectWorkspace } from '@/lib/navigation/project-destination';

/** `/invitations/accept`: the acceptance in the shell's list template. */
export function AcceptInvitationPage() {
  return (
    <ListScreen>
      <AcceptInvitationScreen />
    </ListScreen>
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
      <Stack gap="workspace">
        <EditorialSectionHeader
          title="Invitation"
          description="This link is missing its invitation token."
        />
        <Callout tone="negative">
          Open the invitation link exactly as it was sent to you, or ask for a new one.
        </Callout>
      </Stack>
    );
  }

  return (
    <Stack gap="workspace">
      <EditorialSectionHeader
        title="Joining workspace"
        description="Invitations are single-use and expire, and they only work for the address they were sent to."
      />
      {accept.isError ? (
        <Stack gap="compact">
          <MutationNotice
            notice={mutationNoticeForError(accept.error, {
              action: 'accept this invitation',
            })}
          />
          <div>
            <Button type="button" variant="ghost" onClick={() => router('/projects')}>
              Go to your workspace
            </Button>
          </div>
        </Stack>
      ) : (
        <Callout tone="info">
          {accept.isSuccess
            ? 'You have joined. Taking you there now.'
            : 'Checking your invitation.'}
        </Callout>
      )}
    </Stack>
  );
}
