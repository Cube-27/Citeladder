import { useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';

import { Tag } from '@/components/ui/tag';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import { CopyButton } from '@/components/ui/copy-button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { TitledSection } from '@/components/ui/section';
import { Select } from '@/components/ui/select';
import { TableActionsCell, TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { DisplayTime } from '@/components/ui/display-time';
import type { AssignableWorkspaceRole, WorkspaceInvitation } from '@/lib/api/workspaces';

import { ROLE_OPTIONS, ROLE_SUMMARY, roleLabel } from './member-roles';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';

const INVITE_FORM_ID = 'invite-member-form';

/** Where an invitee accepts. The token is a URL parameter, never stored. */
function acceptanceLink(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/invitations/accept?token=${encodeURIComponent(token)}`;
}

function deliveryNotice(delivery: 'accepted' | 'failed' | undefined): string {
  if (delivery === 'accepted') {
    return 'Email sent; delivery not confirmed. ';
  }
  if (delivery === 'failed') return 'Email not sent. ';
  return 'Email status unknown. ';
}

/** Why the invite form cannot send to this address, or null when it can. */
function inviteEmailError(address: string): string | null {
  if (!address) return 'Enter an email address.';
  return z.email().safeParse(address).success ? null : 'Enter a valid email address.';
}

/**
 * Issue an invitation and hand back its ONE-TIME acceptance link.
 *
 * There is no mail transport in this repository yet, so the administrator
 * delivers the link. The token is shown once and never stored here: only its
 * hash reaches the database, and no later read returns it.
 */
export function InviteDialog({
  open,
  onOpenChange,
  issuedToken,
  delivery,
  pending,
  error,
  onInvite,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issuedToken: string | null;
  delivery?: 'accepted' | 'failed';
  pending: boolean;
  /** Why the last invitation was refused, shown where it was asked for. */
  error: MutationNoticeData | null;
  /** Resolves once the invitation is issued; the address stays until then. */
  onInvite: (email: string, role: AssignableWorkspaceRole) => Promise<unknown>;
}>) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [role, setRole] = useState<AssignableWorkspaceRole>('member');
  const emailInput = useRef<HTMLInputElement>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const address = email.trim();
    const invalid = inviteEmailError(address);
    setEmailError(invalid);
    if (invalid) {
      emailInput.current?.focus();
      return;
    }
    onInvite(address, role).then(
      () => setEmail(''),
      () => undefined,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite member"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" form={INVITE_FORM_ID} pending={pending}>
            Send invitation
          </Button>
        </>
      }
    >
      <form id={INVITE_FORM_ID} noValidate onSubmit={submit}>
        <Stack gap="workspace">
          <Field label="Email" error={emailError ?? undefined}>
            {(field) => (
              <Input
                {...field}
                ref={emailInput}
                type="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailError(null);
                }}
                placeholder="teammate@example.com"
              />
            )}
          </Field>
          <Field label="Workspace role" hint={ROLE_SUMMARY[role]}>
            {(field) => (
              <Select
                {...field}
                value={role}
                onValueChange={setRole}
                options={ROLE_OPTIONS}
                ariaLabel="Invitation role"
              />
            )}
          </Field>
          {error ? <Notice kind="mutation" notice={error} /> : null}
          {issuedToken ? (
            <Notice tone="info">
              <Stack gap="compact" className="justify-items-start">
                <span>
                  {deliveryNotice(delivery)}
                  One-time link, shown once.
                </span>
                <code className="type-caption min-w-0 justify-self-stretch truncate tabular-nums">
                  {acceptanceLink(issuedToken)}
                </code>
                <CopyButton value={acceptanceLink(issuedToken)}>Copy link</CopyButton>
              </Stack>
            </Notice>
          ) : null}
        </Stack>
      </form>
    </Dialog>
  );
}

/** Invitations still waiting to be accepted. Tokens are never listed. */
export function PendingInvitations({
  read,
  busy,
  onResend,
  onRevoke,
}: Readonly<{
  read: RetryableRead &
    Readonly<{
      data: readonly WorkspaceInvitation[] | undefined;
      isLoading: boolean;
      isError: boolean;
    }>;
  busy: boolean;
  onResend: (invitationId: string) => void;
  onRevoke: (invitation: WorkspaceInvitation) => void;
}>) {
  const invitations = read.data ?? [];
  // Hidden only once a read confirms there is nothing pending; a failed read says so.
  if (!read.isLoading && !read.isError && invitations.length === 0) return null;
  return (
    // The table is the named region; the section only heads it.
    <TitledSection title="Pending invitations">
      <DataTable
        label="Pending invitations"
        columns={INVITATION_COLUMNS}
        rowLines={2}
        state={invitationsState(read)}
      >
        {invitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell>
              <TableCellLines
                primary={invitation.email}
                secondary={
                  <>
                    Link expires <DisplayTime value={invitation.expires_at} />
                  </>
                }
              />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <Tag>{roleLabel(invitation.role)}</Tag>
            </TableCell>
            <TableActionsCell>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onResend(invitation.id)}
              >
                Resend
              </Button>
              <ActionButton
                action="revoke"
                type="button"
                disabled={busy}
                onClick={() => onRevoke(invitation)}
              />
            </TableActionsCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

function invitationsState(
  read: RetryableRead & Readonly<{ isLoading: boolean; isError: boolean }>,
): DataTableState | undefined {
  if (read.isError)
    return {
      kind: 'error',
      title: "Couldn't load pending invitations",
      ...readErrorProps(read),
      fallback: 'Pending invitations could not be loaded.',
    };
  if (read.isLoading) return { kind: 'loading', label: 'Loading invitations…' };
  return undefined;
}

const INVITATION_COLUMNS: readonly DataTableColumn[] = [
  { key: 'invitee', label: 'Invitee', kind: 'identity' },
  { key: 'role', label: 'Workspace role', kind: 'status' },
  // Two buttons: the row-actions width, under a visually hidden head.
  { key: 'actions', label: 'Actions', kind: 'actions', width: 'rowActions', hideLabel: true },
];
