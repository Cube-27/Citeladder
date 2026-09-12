'use client';

import { Trash2 } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import type { AssignableWorkspaceRole, WorkspaceMember } from '@/lib/api/workspaces';
import { emailInitials } from '@/lib/utils';

import { ROLE_OPTIONS } from './member-roles';

/**
 * The workspace roster. The Owner row is inert: the single designated Owner
 * changes only through a transfer, which swaps both roles in one server
 * transaction, so no control here can leave the workspace ownerless.
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
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (isError) {
    return (
      <Alert tone="danger">
        The member list could not be loaded.{' '}
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </Alert>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Workspace role</TableHead>
          <TableHead className="text-right">Access</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
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
      </TableBody>
    </Table>
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
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={textRole(
              'label',
              'bg-accent text-accent-fg flex size-7 shrink-0 items-center justify-center rounded-full text-xs uppercase',
            )}
          >
            {emailInitials(member.email)}
          </span>
          <span className="min-w-0 truncate">{member.email}</span>
          {member.is_self ? <Badge variant="neutral">You</Badge> : null}
        </div>
      </TableCell>
      <TableCell>
        {isOwner ? (
          <Badge variant="neutral">Owner</Badge>
        ) : (
          <Select
            value={member.role as AssignableWorkspaceRole}
            onValueChange={(next) => onChangeRole(member.id, next as AssignableWorkspaceRole)}
            options={ROLE_OPTIONS}
            ariaLabel={`Role for ${member.email}`}
            disabled={busy}
          />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5">
          {isOwner ? null : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => {
                  // Ownership only moves back by another transfer, so the
                  // confirmation names the member it is about.
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
              <Tooltip content={`Remove ${member.email}`}>
                <Button
                  type="button"
                  variant="destructiveGhost"
                  size="icon"
                  aria-label={`Remove ${member.email} from this workspace`}
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
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
