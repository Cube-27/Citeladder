'use client';

import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
export function InviteForm({
  issuedToken,
  pending,
  onInvite,
}: Readonly<{
  issuedToken: string | null;
  pending: boolean;
  onInvite: (email: string, role: AssignableWorkspaceRole) => void;
}>) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableWorkspaceRole>('member');

  return (
    <section className="grid gap-3">
      <h3 className={textRole('bodyStrong')}>Invite someone</h3>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const address = email.trim();
          if (!address) return;
          onInvite(address, role);
          setEmail('');
        }}
      >
        <div className="grid min-w-0 flex-1 gap-1">
          <label htmlFor="invite-email" className={textRole('body')}>
            Email address
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
        <div className="grid gap-1">
          <label htmlFor="invite-role" className={textRole('body')}>
            Role
          </label>
          <Select
            id="invite-role"
            value={role}
            onValueChange={(next) => setRole(next as AssignableWorkspaceRole)}
            options={ROLE_OPTIONS}
            ariaLabel="Invitation role"
          />
        </div>
        <Button type="submit" disabled={pending || !email.trim()}>
          Send invitation
        </Button>
      </form>
      <p className="text-muted text-sm">{ROLE_SUMMARY[role]}</p>
      {issuedToken ? (
        <Alert tone="info">
          <div className="grid gap-2">
            <span>
              Share this one-time acceptance link. It is shown once and cannot be retrieved again —
              resending issues a new link and invalidates this one.
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
    </section>
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
  return (
    <section className="grid gap-3">
      <h3 className={textRole('bodyStrong')}>Pending invitations</h3>
      {isLoading ? <Skeleton className="h-16 w-full" /> : null}
      {invitations.length === 0 && !isLoading ? (
        <p className="text-muted text-sm">No invitations are waiting to be accepted.</p>
      ) : null}
      <ul className="grid gap-2">
        {invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="border-border-subtle flex flex-wrap items-center gap-3 border-b pb-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{invitation.email}</span>
            <Badge variant="neutral">{invitation.role}</Badge>
            <Button
              type="button"
              variant="ghost"
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
          </li>
        ))}
      </ul>
    </section>
  );
}
