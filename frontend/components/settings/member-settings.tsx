import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SettingsGroup } from '@/components/ui/setting-row';
import { TextLink } from '@/components/ui/text-link';
import { UserPlus } from '@/lib/icons';
import { PLANS_HREF } from '@/lib/billing/plan-limit';
import { pluralCount } from '@/lib/format';
import { SearchField } from '@/components/ui/search-field';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import {
  refreshWorkspaces,
  workspaceMutations,
  workspaceQueries,
  type AssignableWorkspaceRole,
  type WorkspaceInvitationIssued,
  type WorkspaceMember,
} from '@/lib/api/workspaces';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

import { InviteDialog, PendingInvitations } from './member-invitations';
import { MemberRoster } from './member-roster';
import { ROLE_SUMMARY, roleLabel } from './member-roles';
import { Notice } from '@/components/ui/notice';

type Confirmation = Omit<ConfirmRequest, 'onConfirm'>;

const confirmations = {
  role: (email: string, role: AssignableWorkspaceRole): Confirmation => ({
    question: 'Change role',
    body: `${email} becomes ${roleLabel(role)}: ${ROLE_SUMMARY[role]}`,
    confirmLabel: `Make ${roleLabel(role)}`,
  }),
  transfer: (email: string, workspace: string): Confirmation => ({
    question: 'Transfer ownership',
    body: `${email} becomes the owner of ${workspace}. You become an admin and cannot take ownership back yourself.`,
    confirmLabel: `Make ${email} owner`,
    destructive: true,
  }),
  remove: (email: string, workspace: string): Confirmation => ({
    question: 'Remove member',
    body: `${email} loses access to ${workspace} immediately, including through connected AI tools.`,
    confirmLabel: 'Remove member',
    destructive: true,
  }),
  revoke: (email: string): Confirmation => ({
    question: 'Revoke invitation',
    body: `The invitation link sent to ${email} stops working.`,
    confirmLabel: 'Revoke invitation',
    destructive: true,
  }),
};

function matchingMembers(members: readonly WorkspaceMember[], needle: string) {
  return needle ? members.filter((member) => member.email.toLowerCase().includes(needle)) : members;
}

function searchFindsNobody(
  needle: string,
  settled: boolean,
  visible: readonly WorkspaceMember[],
): boolean {
  return needle !== '' && settled && visible.length === 0;
}

function MemberFailure({
  failure,
  onRetry,
}: Readonly<{ failure: { error: unknown; reset: () => void } | undefined; onRetry: () => void }>) {
  if (!failure) return null;
  return (
    <Notice
      kind="mutation"
      notice={mutationNoticeForError(failure.error, { action: 'change workspace members' })}
      onRetry={() => {
        failure.reset();
        onRetry();
      }}
    />
  );
}

export function MemberSettings({ mayInvite }: Readonly<{ mayInvite: boolean }>) {
  const { activeWorkspaceId, activeWorkspace } = useProjectContext();
  const mayTransfer = useWorkspaceCapability('transfer_ownership');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const queryClient = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<'accepted' | 'failed' | undefined>();

  const workspaceId = activeWorkspaceId;
  const enabled = workspaceId !== null;

  const [tokenWorkspaceId, setTokenWorkspaceId] = useState(workspaceId);
  if (tokenWorkspaceId !== workspaceId) {
    setTokenWorkspaceId(workspaceId);
    setIssuedToken(null);
  }

  const scopeId = workspaceId ?? 'unresolved';
  const membersQuery = useQuery({ ...workspaceQueries.members(scopeId), enabled });
  const invitationsQuery = useQuery({ ...workspaceQueries.invitations(scopeId), enabled });

  const refresh = () => void refreshWorkspaces(queryClient);
  const keepToken = (
    issued: { token: string; delivery?: 'accepted' | 'failed' },
    origin: string,
  ) => {
    if (origin !== workspaceId) return;
    setIssuedToken(issued.token);
    setDelivery(issued.delivery);
    setInviteOpen(true);
  };

  const invite = useMutation(workspaceMutations.invite(String(workspaceId)));
  const resend = useMutation(workspaceMutations.resendInvitation(String(workspaceId)));
  const revoke = useMutation(workspaceMutations.revokeInvitation(String(workspaceId)));
  const changeRole = useMutation(workspaceMutations.changeRole(String(workspaceId)));
  const remove = useMutation(workspaceMutations.removeMember(String(workspaceId)));
  const transfer = useMutation(workspaceMutations.transferOwnership(String(workspaceId)));
  const handOffToken = () => {
    setIssuedToken(null);
    const origin = String(workspaceId);
    return { onSuccess: (issued: WorkspaceInvitationIssued) => keepToken(issued, origin) };
  };

  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const visibleMembers = matchingMembers(membersQuery.data ?? [], needle);

  const mutations = [resend, revoke, changeRole, remove, transfer];
  const failure = mutations.find((mutation) => mutation.isError);
  const busy = invite.isPending || mutations.some((mutation) => mutation.isPending);
  const workspaceName = activeWorkspace?.name ?? 'this workspace';
  const confirming = useRef(false);
  const confirmThen = (request: Confirmation, run: () => Promise<unknown>) =>
    setConfirm({
      ...request,
      onConfirm: () => {
        if (confirming.current) return;
        confirming.current = true;
        void run()
          .catch(() => undefined)
          .finally(() => {
            confirming.current = false;
            setConfirm(null);
          });
      },
    });
  const transferIntent = mayTransfer
    ? (member: WorkspaceMember) =>
        confirmThen(confirmations.transfer(member.email, workspaceName), () =>
          transfer.mutateAsync(member.id),
        )
    : undefined;

  return (
    <>
      <SettingsGroup
        title="Members"
        region={false}
        description={
          membersQuery.data ? pluralCount(membersQuery.data.length, 'member') : undefined
        }
        action={
          mayInvite ? (
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(true)}>
              <Icon icon={UserPlus} />
              Invite
            </Button>
          ) : undefined
        }
      >
        {mayInvite ? null : (
          <Notice tone="info">
            Inviting members needs a paid plan. <TextLink href={PLANS_HREF}>See plans</TextLink>
          </Notice>
        )}
        <MemberFailure failure={failure} onRetry={refresh} />
        <MemberRoster
          members={visibleMembers}
          toolbar={{
            search: (
              <SearchField
                value={search}
                onValueChange={setSearch}
                placeholder="Search members…"
                aria-label="Search members"
              />
            ),
          }}
          noMatch={
            searchFindsNobody(needle, membersQuery.isSuccess, visibleMembers) ? search.trim() : null
          }
          isLoading={membersQuery.isLoading}
          isError={membersQuery.isError}
          error={membersQuery.error}
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
      </SettingsGroup>

      <PendingInvitations
        read={invitationsQuery}
        busy={busy}
        onResend={(invitationId) => resend.mutate(invitationId, handOffToken())}
        onRevoke={(invitation) =>
          confirmThen(confirmations.revoke(invitation.email), () =>
            revoke.mutateAsync(invitation.id),
          )
        }
      />

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        issuedToken={issuedToken}
        delivery={delivery}
        pending={invite.isPending}
        error={
          invite.error
            ? mutationNoticeForError(invite.error, { action: 'send the invitation' })
            : null
        }
        onInvite={(email, role) => invite.mutateAsync({ email, role }, handOffToken())}
      />
      <ConfirmDialog request={confirm} pending={busy} onCancel={() => setConfirm(null)} />
    </>
  );
}
