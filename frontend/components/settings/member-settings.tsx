import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';

import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { TextLink } from '@/components/ui/text-link';
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
    <Notice
      kind="mutation"
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
export function MemberSettings({ mayInvite }: Readonly<{ mayInvite: boolean }>) {
  const { activeWorkspaceId, activeWorkspace } = useProjectContext();
  const mayTransfer = useWorkspaceCapability('transfer_ownership');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const queryClient = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<'accepted' | 'failed' | undefined>();

  const workspaceId = activeWorkspaceId;
  const enabled = workspaceId !== null;

  // A token belongs to ONE workspace. Switching workspace must not leave the
  // previous workspace's acceptance link on screen for the reader to copy.
  const [tokenWorkspaceId, setTokenWorkspaceId] = useState(workspaceId);
  if (tokenWorkspaceId !== workspaceId) {
    setTokenWorkspaceId(workspaceId);
    setIssuedToken(null);
  }

  // Held disabled until the workspace is known, so the placeholder never reaches the API.
  const scopeId = workspaceId ?? 'unresolved';
  const membersQuery = useQuery({ ...workspaceQueries.members(scopeId), enabled });
  const invitationsQuery = useQuery({ ...workspaceQueries.invitations(scopeId), enabled });

  const refresh = () => void refreshWorkspaces(queryClient);
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
  };

  const invite = useMutation(workspaceMutations.invite(String(workspaceId)));
  const resend = useMutation(workspaceMutations.resendInvitation(String(workspaceId)));
  const revoke = useMutation(workspaceMutations.revokeInvitation(String(workspaceId)));
  const changeRole = useMutation(workspaceMutations.changeRole(String(workspaceId)));
  const remove = useMutation(workspaceMutations.removeMember(String(workspaceId)));
  const transfer = useMutation(workspaceMutations.transferOwnership(String(workspaceId)));
  /**
   * A link belonging to the PREVIOUS invitation must not stay on screen while
   * a new one is in flight: copying it would share the wrong token. The
   * workspace the request was sent for travels with it.
   */
  const handOffToken = () => {
    setIssuedToken(null);
    const origin = String(workspaceId);
    return { onSuccess: (issued: WorkspaceInvitationIssued) => keepToken(issued, origin) };
  };

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
  // A second click lands before `busy` re-renders, so the guard is synchronous.
  const confirming = useRef(false);
  const confirmThen = (request: Confirmation, run: () => Promise<unknown>) =>
    setConfirm({
      ...request,
      // A failure is reported by the notice above the roster.
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
  // Ownership moves only at the Owner's hand; nobody else is offered it.
  const transferIntent = mayTransfer
    ? (member: WorkspaceMember) =>
        confirmThen(confirmations.transfer(member.email, workspaceName), () =>
          transfer.mutateAsync(member.id),
        )
    : undefined;

  return (
    <>
      {/* The roster table is the named region; the section only heads it. */}
      <Section>
        <SectionHeader
          actions={
            mayInvite ? (
              <Button type="button" variant="secondary" onClick={() => setInviteOpen(true)}>
                <Icon icon={UserPlus} />
                Invite
              </Button>
            ) : undefined
          }
        >
          <SectionTitle>Members</SectionTitle>
          {membersQuery.data ? (
            <SectionDescription>
              {pluralCount(membersQuery.data.length, 'member')}
            </SectionDescription>
          ) : null}
        </SectionHeader>
        <Stack gap="workspace">
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
              searchFindsNobody(needle, membersQuery.isSuccess, visibleMembers)
                ? search.trim()
                : null
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
        </Stack>
      </Section>

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
