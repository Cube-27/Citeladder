'use client';

import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import type { AssignableWorkspaceRole, WorkspaceInvitation } from '@/lib/api/workspaces';

import { ROLE_OPTIONS, ROLE_SUMMARY, roleLabel } from './member-roles';

const INVITE_FORM_ID = 'invite-member-form';

/** Where an invitee accepts. The token is a URL parameter, never stored. */
function acceptanceLink(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/invitations/accept?token=${encodeURIComponent(token)}`;
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
  const submit = (event: FormEvent<HTMLFormElement>) => {
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
      <form
        id={INVITE_FORM_ID}
        noValidate
        onSubmit={submit}
        className="grid gap-[var(--workspace-gap)]"
      >
        <Stack gap="tight">
          <label htmlFor="invite-email" className={textRole('label')}>
            Email
          </label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.com"
          />
        </Stack>
        <Stack gap="tight">
          <label htmlFor="invite-role" className={textRole('label')}>
            Workspace role
          </label>
          <Select
            id="invite-role"
            value={role}
            onValueChange={setRole}
            options={ROLE_OPTIONS}
            ariaLabel="Invitation role"
          />
          <p className={textRole('caption')}>{ROLE_SUMMARY[role]}</p>
        </Stack>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {issuedToken ? (
          <Alert tone="info">
            <div className="grid gap-2">
              <span>
                {delivery === 'accepted'
                  ? 'The email provider accepted the invitation. Inbox delivery is not confirmed. '
                  : delivery === 'failed'
                    ? 'The email provider did not accept the invitation. '
                    : 'Email delivery status is unavailable. '}
                Share this one-time acceptance link. It is shown once and cannot be retrieved again
                — resending issues a new link and invalidates this one.
              </span>
              <div className="flex items-center gap-2">
                <code className="type-caption min-w-0 flex-1 truncate tabular-nums">
                  {acceptanceLink(issuedToken)}
                </code>
                <CopyButton value={acceptanceLink(issuedToken)}>Copy link</CopyButton>
              </div>
            </div>
          </Alert>
        ) : null}
      </form>
    </Dialog>
  );
}

/** Invitations still waiting to be accepted. Tokens are never listed. */
export function PendingInvitations({
  invitations,
  isLoading,
  busy,
  onResend,
  onRevoke,
}: Readonly<{
  invitations: readonly WorkspaceInvitation[];
  isLoading: boolean;
  busy: boolean;
  onResend: (invitationId: string) => void;
  onRevoke: (invitation: WorkspaceInvitation) => void;
}>) {
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (invitations.length === 0) return null;
  return (
    <Stack as="section" gap="compact">
      <EditorialSectionHeader title="Pending invitations" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invitee</TableHead>
            <TableHead>Workspace role</TableHead>
            <TableHead>Link expires</TableHead>
            <TableHead className="text-right">Access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableCell>
                <span className="min-w-0 truncate">{invitation.email}</span>
              </TableCell>
              <TableCell>
                <Badge variant="neutral">{roleLabel(invitation.role)}</Badge>
              </TableCell>
              <TableCell className="type-caption tabular-nums">
                <DisplayTime value={invitation.expires_at} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onResend(invitation.id)}
                  >
                    Resend
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onRevoke(invitation)}
                  >
                    Revoke
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}
