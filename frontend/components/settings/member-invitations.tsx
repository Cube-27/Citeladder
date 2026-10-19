'use client';

import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { readErrorProps, type RetryableRead } from '@/components/ui/read-error';
import { Inline, Stack } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { ClampText, TableCell, TableRow } from '@/components/ui/table';
import type { AssignableWorkspaceRole, WorkspaceInvitation } from '@/lib/api/workspaces';

import { ROLE_OPTIONS, ROLE_SUMMARY, roleLabel } from './member-roles';

const INVITE_FORM_ID = 'invite-member-form';

/** Where an invitee accepts. The token is a URL parameter, never stored. */
function acceptanceLink(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/invitations/accept?token=${encodeURIComponent(token)}`;
}

function deliveryNotice(delivery: 'accepted' | 'failed' | undefined): string {
  if (delivery === 'accepted') {
    return 'The email provider accepted the invitation. Inbox delivery is not confirmed. ';
  }
  if (delivery === 'failed') return 'The email provider did not accept the invitation. ';
  return 'Email delivery status is unavailable. ';
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
  error: string | null;
  /** Resolves once the invitation is issued; the address stays until then. */
  onInvite: (email: string, role: AssignableWorkspaceRole) => Promise<unknown>;
}>) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableWorkspaceRole>('member');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address || pending) return;
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
      description="They receive the workspace role you choose here."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={INVITE_FORM_ID} disabled={!email.trim()} pending={pending}>
            Send invitation
          </Button>
        </>
      }
    >
      <form id={INVITE_FORM_ID} noValidate onSubmit={submit}>
        <Stack gap="workspace">
          <Field label="Email">
            {(field) => (
              <Input
                {...field}
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {issuedToken ? (
            <Alert tone="info">
              <Stack gap="compact" className="justify-items-start">
                <span>
                  {deliveryNotice(delivery)}
                  Share this one-time acceptance link. It is shown once and cannot be retrieved
                  again — resending issues a new link and invalidates this one.
                </span>
                <code className="type-caption min-w-0 justify-self-stretch truncate tabular-nums">
                  {acceptanceLink(issuedToken)}
                </code>
                <CopyButton value={acceptanceLink(issuedToken)}>Copy link</CopyButton>
              </Stack>
            </Alert>
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
    <DataTable
      title="Pending invitations"
      columns={INVITATION_COLUMNS}
      state={invitationsState(read)}
    >
      {invitations.map((invitation) => (
        <TableRow key={invitation.id}>
          <TableCell>
            <ClampText lines={1}>{invitation.email}</ClampText>
          </TableCell>
          <TableCell className="whitespace-nowrap">
            <Badge variant="neutral">{roleLabel(invitation.role)}</Badge>
          </TableCell>
          <TableCell numeric className="type-caption">
            <DisplayTime value={invitation.expires_at} />
          </TableCell>
          <TableCell className="whitespace-nowrap">
            <Inline className="justify-end">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onResend(invitation.id)}
              >
                Resend
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => onRevoke(invitation)}
              >
                Revoke
              </Button>
            </Inline>
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

function invitationsState(
  read: RetryableRead & Readonly<{ isLoading: boolean; isError: boolean }>,
): DataTableState | undefined {
  if (read.isError)
    return {
      kind: 'error',
      ...readErrorProps(read),
      fallback: 'Pending invitations could not be loaded.',
    };
  if (read.isLoading) return { kind: 'loading', label: 'Loading invitations…' };
  return undefined;
}

const INVITATION_COLUMNS: readonly DataTableColumn[] = [
  { key: 'invitee', label: 'Invitee' },
  { key: 'role', label: 'Workspace role', width: 'status' },
  { key: 'expires', label: 'Link expires', width: 'date', numeric: true },
  { key: 'access', label: 'Access', width: 'name', numeric: 'end' },
];
