'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';

import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { FilterRow } from '@/components/ui/filter-row';
import { Stack } from '@/components/ui/layout';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { SearchField } from '@/components/ui/search-field';
import { textRole } from '@/components/ui/typography';
import { humanizeApiError } from '@/lib/api/errors';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { queryKeys } from '@/lib/api/query-keys';
import {
  workspacesApi,
  type AssignableWorkspaceRole,
  type WorkspaceMember,
} from '@/lib/api/workspaces';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

import { InviteDialog, PendingInvitations } from './member-invitations';
import { MemberRoster } from './member-roster';
import { ROLE_SUMMARY, roleLabel } from './member-roles';

type Confirmation = Omit<ConfirmRequest, 'onConfirm'>;

/** What each member change asks before it happens, naming the person and the effect. */
const confirmations = {
  role: (email: string, role: AssignableWorkspaceRole): Confirmation => ({
    title: 'Change role',
    body: `${email} becomes ${roleLabel(role)}: ${ROLE_SUMMARY[role]}`,
    confirmLabel: `Make ${roleLabel(role)}`,
  }),
  transfer: (email: string, workspace: string): Confirmation => ({
    title: 'Transfer ownership',
    body: `${email} becomes the owner of ${workspace}. You become an admin and cannot take ownership back yourself.`,
    confirmLabel: `Make ${email} owner`,
    destructive: true,
  }),
  remove: (email: string, workspace: string): Confirmation => ({
    title: 'Remove member',
    body: `${email} loses access to ${workspace} immediately, including through connected AI tools.`,
    confirmLabel: 'Remove member',
    destructive: true,
  }),
  revoke: (email: string): Confirmation => ({
    title: 'Revoke invitation',
    body: `The invitation link sent to ${email} stops working.`,
    confirmLabel: 'Revoke invitation',
    destructive: true,
  }),
};

/** Members whose address contains the search, or everyone without one. */
function matchingMembers(members: readonly WorkspaceMember[], needle: string) {
  return needle ? members.filter((member) => member.email.toLowerCase().includes(needle)) : members;
}

/** A search that settled and matched nobody, as opposed to an empty roster. */
function searchFindsNobody(
  needle: string,
  settled: boolean,
  visible: readonly WorkspaceMember[],
): boolean {
  return needle !== '' && settled && visible.length === 0;
}

/** The first failed member change, with a retry that clears it. */
function MemberFailure({
  failure,
  onRetry,
}: Readonly<{ failure: { error: unknown; reset: () => void } | undefined; onRetry: () => void }>) {
  if (!failure) return null;
  return (
    <MutationNotice
      notice={mutationNoticeForError(failure.error, { action: 'change workspace members' })}
      // Clearing the failed mutation is what makes the notice go away;
      // re-reading the roster alone would leave it standing forever.
      onRetry={() => {
        failure.reset();
        onRetry();
      }}
    />
  );
}

/**
 * Workspace members and invitations (plan §2.4).
 *
 * Administrative throughout: the workspace panel mounts it only for the
 * `manage_members` capability, and every action it offers is refused by the
 * server for any role that lacks it. Hiding a control is a convenience,
 * never the boundary.
 *
 * This component owns the server conversation; the roster, the invite form
 * and the pending list are presentation.
 */
export function MemberSettings() {
  const { activeWorkspaceId, activeWorkspace } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  const mayTransfer = useWorkspaceCapability('transfer_ownership');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const queryClient = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<'accepted' | 'failed' | undefined>();

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
    queryFn: ({ signal }) =>
      workspacesApi.listMembers(String(workspaceId), { signal, workspaceId }),
    enabled,
  });
  const invitationsQuery = useQuery({
    queryKey: queryKeys.workspaces.invitations(workspaceId ?? 'unresolved'),
    queryFn: ({ signal }) =>
      workspacesApi.listInvitations(String(workspaceId), { signal, workspaceId }),
    enabled,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
  };
  /**
   * Show a freshly issued token only if it still belongs where we are.
   *
   * An invite or resend for workspace A can land AFTER the reader has
   * switched to workspace B. Displaying A's one-time acceptance link on B's
   * screen invites sharing it with the wrong people, so a late answer for a
   * workspace we have left is dropped rather than rendered.
   */
  const keepToken = (
    issued: { token: string; delivery?: 'accepted' | 'failed' },
    origin: string,
  ) => {
    if (origin !== workspaceId) return;
    setIssuedToken(issued.token);
    setDelivery(issued.delivery);
    // The dialog is the only place the link is shown, and a resend from the
    // pending table happens with it closed.
    setInviteOpen(true);
    refresh();
  };

  const invite = useMutation({
    mutationFn: (input: { email: string; role: AssignableWorkspaceRole }) =>
      workspacesApi.inviteMember(String(workspaceId), input, { workspaceId }),
    // A link belonging to the PREVIOUS invitation must not stay on screen
    // while a new one is in flight: copying it would share the wrong token.
    onMutate: () => {
      setIssuedToken(null);
      return { origin: workspaceId };
    },
    onSuccess: (issued, _input, context) => keepToken(issued, String(context?.origin)),
  });
  const resend = useMutation({
    mutationFn: (invitationId: string) =>
      workspacesApi.resendInvitation(String(workspaceId), invitationId, { workspaceId }),
    onMutate: () => {
      setIssuedToken(null);
      return { origin: workspaceId };
    },
    onSuccess: (issued, _id, context) => keepToken(issued, String(context?.origin)),
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) =>
      workspacesApi.revokeInvitation(String(workspaceId), invitationId, { workspaceId }),
    onSuccess: refresh,
  });
  const changeRole = useMutation({
    mutationFn: (input: { memberId: string; role: AssignableWorkspaceRole }) =>
      workspacesApi.updateMemberRole(String(workspaceId), input.memberId, input.role, {
        workspaceId,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (memberId: string) =>
      workspacesApi.removeMember(String(workspaceId), memberId, { workspaceId }),
    onSuccess: refresh,
  });
  const transfer = useMutation({
    mutationFn: (memberId: string) =>
      workspacesApi.transferOwnership(String(workspaceId), memberId, { workspaceId }),
    onSuccess: refresh,
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const visibleMembers = matchingMembers(membersQuery.data ?? [], needle);

  // An invitation refusal is shown in the invite dialog, where it was asked for.
  const mutations = [resend, revoke, changeRole, remove, transfer];
  const failure = mutations.find((mutation) => mutation.isError);
  const busy = invite.isPending || mutations.some((mutation) => mutation.isPending);
  const workspaceName = activeWorkspace?.name ?? 'this workspace';
  /** Ask first; close once the change has landed or failed. */
  const confirmThen = (request: Confirmation, run: () => Promise<unknown>) =>
    setConfirm({
      ...request,
      // A failure is reported by the notice above the roster.
      onConfirm: () =>
        void run()
          .catch(() => undefined)
          .finally(() => setConfirm(null)),
    });
  // Ownership moves only at the Owner's hand; nobody else is offered it.
  const transferIntent = mayTransfer
    ? (member: WorkspaceMember) =>
        confirmThen(confirmations.transfer(member.email, workspaceName), () =>
          transfer.mutateAsync(member.id),
        )
    : undefined;

  return (
    <Stack gap="workspace">
      {/* The tab already names this section; the row states the scope and
          carries the roster's controls. */}
      <p className={textRole('body')}>
        Who can work in {workspaceName}, and what each of them may do.
      </p>
      <FilterRow
        searchWidth="sm"
        search={
          <SearchField
            value={search}
            onValueChange={setSearch}
            placeholder="Search members…"
            aria-label="Search members"
          />
        }
        actions={
          <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-3.5" aria-hidden />
            Invite
          </Button>
        }
      />

      <MemberFailure failure={failure} onRetry={refresh} />

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        issuedToken={issuedToken}
        delivery={delivery}
        pending={invite.isPending}
        error={invite.error ? humanizeApiError(invite.error).message : null}
        onInvite={(email, role) => invite.mutateAsync({ email, role })}
      />

      {searchFindsNobody(needle, membersQuery.isSuccess, visibleMembers) ? (
        <p className={textRole('body')}>No members match “{search.trim()}”.</p>
      ) : (
        <MemberRoster
          members={visibleMembers}
          isLoading={membersQuery.isLoading}
          isError={membersQuery.isError}
          busy={busy}
          onRetry={refresh}
          onChangeRole={(member, role) =>
            confirmThen(confirmations.role(member.email, role), () =>
              changeRole.mutateAsync({ memberId: member.id, role }),
            )
          }
          onTransfer={transferIntent}
          onRemove={(member) =>
            confirmThen(confirmations.remove(member.email, workspaceName), () =>
              remove.mutateAsync(member.id),
            )
          }
        />
      )}

      <PendingInvitations
        invitations={invitationsQuery.data ?? []}
        isLoading={invitationsQuery.isLoading}
        busy={busy}
        onResend={(invitationId) => resend.mutate(invitationId)}
        onRevoke={(invitation) =>
          confirmThen(confirmations.revoke(invitation.email), () =>
            revoke.mutateAsync(invitation.id),
          )
        }
      />

      <ConfirmDialog request={confirm} pending={busy} onCancel={() => setConfirm(null)} />
    </Stack>
  );
}
