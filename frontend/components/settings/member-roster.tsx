'use client';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import type { AssignableWorkspaceRole, WorkspaceMember } from '@/lib/api/workspaces';

import { ROLE_OPTIONS } from './member-roles';

/**
 * The workspace roster, with the role controls an administrator may use.
 *
 * The Owner row is deliberately inert: the single designated Owner changes
 * only through a transfer, which swaps both roles in one server transaction,
 * so there is no control here that could leave the workspace ownerless.
 */
export function MemberRoster({
  members,
  isLoading,
  isError,
  busy,
  onRetry,
  onChangeRole,
  onTransfer,
  onRemove,
}: Readonly<{
  members: readonly WorkspaceMember[];
  isLoading: boolean;
  isError: boolean;
  busy: boolean;
  onRetry: () => void;
  onChangeRole: (memberId: string, role: AssignableWorkspaceRole) => void;
  onTransfer: (memberId: string) => void;
  onRemove: (memberId: string) => void;
}>) {
  return (
    <section className="grid max-w-[640px] gap-3">
      <h3 className={textRole('sectionTitle')}>Current members</h3>
      {isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {isError ? (
        <Alert tone="danger">
          The member list could not be loaded.{' '}
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </Alert>
      ) : null}
      <ul className="grid gap-2">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            busy={busy}
            onChangeRole={onChangeRole}
            onTransfer={onTransfer}
            onRemove={onRemove}
          />
        ))}
      </ul>
      <p className="text-muted text-sm">
        Transferring ownership makes you an admin in the same step, so the workspace is never left
        without an owner.
      </p>
    </section>
  );
}

function MemberRow({
  member,
  busy,
  onChangeRole,
  onTransfer,
  onRemove,
}: Readonly<{
  member: WorkspaceMember;
  busy: boolean;
  onChangeRole: (memberId: string, role: AssignableWorkspaceRole) => void;
  onTransfer: (memberId: string) => void;
  onRemove: (memberId: string) => void;
}>) {
  const isOwner = member.role === 'owner';
  return (
    <li className="border-border-subtle flex flex-wrap items-center gap-3 border-b pb-2 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-sm">{member.email}</span>
      {member.is_self ? <Badge variant="neutral">You</Badge> : null}
      {isOwner ? (
        <Badge variant="neutral">Owner</Badge>
      ) : (
        <>
          <Select
            value={member.role as AssignableWorkspaceRole}
            onValueChange={(next) => onChangeRole(member.id, next as AssignableWorkspaceRole)}
            options={ROLE_OPTIONS}
            ariaLabel={`Role for ${member.email}`}
            disabled={busy}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              // Both are hard to undo from here — ownership only moves back by
              // another transfer, and a removed member needs a fresh
              // invitation — so each names the member it is about.
              if (
                window.confirm(
                  `Make ${member.email} the owner of this workspace? You become an admin.`,
                )
              ) {
                onTransfer(member.id);
              }
            }}
          >
            Make owner
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Remove ${member.email} from this workspace? They lose access immediately.`,
                )
              ) {
                onRemove(member.id);
              }
            }}
          >
            Remove
          </Button>
        </>
      )}
    </li>
  );
}
