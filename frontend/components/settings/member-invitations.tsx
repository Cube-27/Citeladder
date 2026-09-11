'use client';

import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import type { AssignableWorkspaceRole, WorkspaceInvitation } from '@/lib/api/workspaces';

import { ROLE_OPTIONS, ROLE_SUMMARY } from './member-roles';

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
  pending,
  onInvite,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issuedToken: string | null;
  pending: boolean;
  onInvite: (email: string, role: AssignableWorkspaceRole) => void;
}>) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableWorkspaceRole>('member');
  const submit = () => {
    const address = email.trim();
    if (!address) return;
    onInvite(address, role);
    setEmail('');
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
          <Button type="button" disabled={pending || !email.trim()} onClick={submit}>
            Send invitation
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
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
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="invite-role" className={textRole('label')}>
            Workspace role
          </label>
          <Select
            id="invite-role"
            value={role}
            onValueChange={(next) => setRole(next as AssignableWorkspaceRole)}
            options={ROLE_OPTIONS}
            ariaLabel="Invitation role"
          />
          <p className={textRole('meta')}>{ROLE_SUMMARY[role]}</p>
        </div>
        {issuedToken ? (
          <Alert tone="info">
            <div className="grid gap-2">
              <span>
                Share this one-time acceptance link. It is shown once and cannot be retrieved again
                — resending issues a new link and invalidates this one.
              </span>
              <div className="flex items-center gap-2">
                <code className="mono text-secondary min-w-0 flex-1 truncate text-xs">
                  {acceptanceLink(issuedToken)}
                </code>
                <CopyButton value={acceptanceLink(issuedToken)}>Copy link</CopyButton>
              </div>
            </div>
          </Alert>
        ) : null}
      </div>
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
  onRevoke: (invitationId: string) => void;
}>) {
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (invitations.length === 0) return null;
  return (
    <section className="grid gap-3">
      <h3 className={textRole('sectionTitle')}>Pending invitations</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invitee</TableHead>
            <TableHead>Workspace role</TableHead>
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
                <Badge variant="neutral">{invitation.role}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1.5">
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
                    onClick={() => onRevoke(invitation.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
