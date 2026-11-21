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
import { SettingsGroup } from '@/components/ui/setting-row';
import { Select } from '@/components/ui/select';
import { TableActionsCell, TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { DisplayTime } from '@/components/ui/display-time';
import type { AssignableWorkspaceRole, WorkspaceInvitation } from '@/lib/api/workspaces';

import { ROLE_OPTIONS, ROLE_SUMMARY, roleLabel } from './member-roles';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';

const INVITE_FORM_ID = 'invite-member-form';

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

function inviteEmailError(address: string): string | null {
  if (!address) return 'Enter an email address.';
  return z.email().safeParse(address).success ? null : 'Enter a valid email address.';
}

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
  error: MutationNoticeData | null;
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
  if (!read.isLoading && !read.isError && invitations.length === 0) return null;
  return (
    <SettingsGroup title="Pending invitations" region={false}>
      <DataTable
        label="Pending invitations"
        columns={INVITATION_COLUMNS}
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
    </SettingsGroup>
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
  { key: 'actions', label: 'Actions', kind: 'actions', width: 'rowActions', hideLabel: true },
];
