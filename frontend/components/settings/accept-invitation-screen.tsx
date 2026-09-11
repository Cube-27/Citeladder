'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { queryKeys } from '@/lib/api/query-keys';
import { workspacesApi } from '@/lib/api/workspaces';
import { useSelectWorkspace } from '@/lib/navigation/project-destination';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const selectWorkspace = useSelectWorkspace();
  const token = searchParams?.get('token') ?? '';
  // One attempt per token. A re-render must not re-post it, and the server's
  // repeated-acceptance path is inert anyway.
  const attempted = useRef<string | null>(null);

  const accept = useMutation({
    mutationFn: () => workspacesApi.acceptInvitation(token),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      selectWorkspace(workspace.id, '/projects');
    },
  });

  useEffect(() => {
    if (!token || attempted.current === token) return;
    attempted.current = token;
    accept.mutate();
  }, [accept, token]);

  if (!token) {
    return (
      <div className="grid gap-[var(--workspace-gap)]">
        <EditorialSectionHeader
          title="Invitation"
          description="This link is missing its invitation token."
        />
        <Alert tone="danger">
          Open the invitation link exactly as it was sent to you, or ask for a new one.
        </Alert>
      </div>
    );
  }

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <EditorialSectionHeader
        title="Joining workspace"
        description="Invitations are single-use and expire, and they only work for the address they were sent to."
      />
      {accept.isError ? (
        <div className="grid gap-3">
          <MutationNotice
            notice={mutationNoticeForError(accept.error, {
              action: 'accept this invitation',
            })}
          />
          <div>
            <Button type="button" variant="ghost" onClick={() => router.push('/projects')}>
              Go to your workspace
            </Button>
          </div>
        </div>
      ) : (
        <Alert tone="info">
          {accept.isSuccess
            ? 'You have joined. Taking you there now.'
            : 'Checking your invitation.'}
        </Alert>
      )}
    </div>
  );
}
