'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { queryKeys } from '@/lib/api/query-keys';
import { workspacesApi, type AssignableWorkspaceRole } from '@/lib/api/workspaces';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

import { InviteForm, PendingInvitations } from './member-invitations';
import { MemberRoster } from './member-roster';

/**
 * Workspace members and invitations (plan §2.4).
 *
 * Administrative throughout: the panel is replaced by an explanation without
 * the `manage_members` capability, and every action it offers is refused by
 * the server for any role that lacks it. Hiding a control is a convenience,
 * never the boundary.
 *
 * This component owns the server conversation; the roster, the invite form
 * and the pending list are presentation.
 */
export function MemberSettings() {
  const { activeWorkspaceId, activeWorkspace } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  const queryClient = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const workspaceId = activeWorkspaceId;
  const enabled = mayManage && workspaceId !== null;

  // A token belongs to ONE workspace. Switching workspace must not leave the
  // previous workspace's acceptance link on screen for the reader to copy.
  const [tokenWorkspaceId, setTokenWorkspaceId] = useState(workspaceId);
  if (tokenWorkspaceId !== workspaceId) {
    setTokenWorkspaceId(workspaceId);
    setIssuedToken(null);
  }

  const membersQuery = useQuery({
    queryKey: queryKeys.workspaces.members(workspaceId ?? 'unresolved'),
    queryFn: ({ signal }) => workspacesApi.listMembers(String(workspaceId), { signal }),
    enabled,
  });
  const invitationsQuery = useQuery({
    queryKey: queryKeys.workspaces.invitations(workspaceId ?? 'unresolved'),
    queryFn: ({ signal }) => workspacesApi.listInvitations(String(workspaceId), { signal }),
    enabled,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
  };
  const keepToken = (issued: { token: string }) => {
    setIssuedToken(issued.token);
    refresh();
  };

  const invite = useMutation({
    mutationFn: (input: { email: string; role: AssignableWorkspaceRole }) =>
      workspacesApi.inviteMember(String(workspaceId), input),
    // A link belonging to the PREVIOUS invitation must not stay on screen
    // while a new one is in flight: copying it would share the wrong token.
    onMutate: () => setIssuedToken(null),
    onSuccess: keepToken,
  });
  const resend = useMutation({
    mutationFn: (invitationId: string) =>
      workspacesApi.resendInvitation(String(workspaceId), invitationId),
    onMutate: () => setIssuedToken(null),
    onSuccess: keepToken,
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) =>
      workspacesApi.revokeInvitation(String(workspaceId), invitationId),
    onSuccess: refresh,
  });
  const changeRole = useMutation({
    mutationFn: (input: { memberId: string; role: AssignableWorkspaceRole }) =>
      workspacesApi.updateMemberRole(String(workspaceId), input.memberId, input.role),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (memberId: string) => workspacesApi.removeMember(String(workspaceId), memberId),
    onSuccess: refresh,
  });
  const transfer = useMutation({
    mutationFn: (memberId: string) =>
      workspacesApi.transferOwnership(String(workspaceId), memberId),
    onSuccess: refresh,
  });

  const mutations = [invite, resend, revoke, changeRole, remove, transfer];
  const failure = mutations.find((mutation) => mutation.isError);
  const busy = mutations.some((mutation) => mutation.isPending);

  if (!mayManage) {
    return (
      <div className="grid gap-[var(--workspace-gap)]">
        <EditorialSectionHeader
          title="Members"
          description="Managing members is available to the workspace owner and admins."
        />
        <Alert tone="info">
          Ask an owner or admin to change roles or invite someone to this workspace.
        </Alert>
      </div>
    );
  }

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <EditorialSectionHeader
        title="Members"
        description={`Who can work in ${activeWorkspace?.name ?? 'this workspace'}, and what each of them may do.`}
      />

      {failure ? (
        <MutationNotice
          notice={mutationNoticeForError(failure.error, { action: 'change workspace members' })}
          // Clearing the failed mutation is what makes the notice go away;
          // re-reading the roster alone would leave it standing forever.
          onRetry={() => {
            failure.reset();
            refresh();
          }}
        />
      ) : null}

      <InviteForm
        issuedToken={issuedToken}
        pending={invite.isPending}
        onInvite={(email, role) => invite.mutate({ email, role })}
      />

      <MemberRoster
        members={membersQuery.data ?? []}
        isLoading={membersQuery.isLoading}
        isError={membersQuery.isError}
        busy={busy}
        onRetry={refresh}
        onChangeRole={(memberId, role) => changeRole.mutate({ memberId, role })}
        onTransfer={(memberId) => transfer.mutate(memberId)}
        onRemove={(memberId) => remove.mutate(memberId)}
      />

      <PendingInvitations
        invitations={invitationsQuery.data ?? []}
        isLoading={invitationsQuery.isLoading}
        busy={busy}
        onResend={(invitationId) => resend.mutate(invitationId)}
        onRevoke={(invitationId) => revoke.mutate(invitationId)}
      />
    </div>
  );
}
