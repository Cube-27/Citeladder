'use client';

import { SearchX, Trash2 } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import type { FilterBarProps } from '@/components/ui/filter-bar';
import { Inline } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { ClampText, TableCell, TableRow } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import type { AssignableWorkspaceRole, WorkspaceMember } from '@/lib/api/workspaces';

import { ROLE_OPTIONS, roleLabel } from './member-roles';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'member', label: 'Member' },
  { key: 'role', label: 'Workspace role', width: 'name' },
  { key: 'access', label: 'Access', width: 'name', numeric: 'end' },
];

/** What the roster shows instead of rows, if anything. */
function rosterState({
  isLoading,
  isError,
  error,
  onRetry,
  noMatch,
}: Readonly<{
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  noMatch: string | null;
}>): DataTableState | undefined {
  if (isLoading) return { kind: 'loading', label: 'Loading members…' };
  if (isError)
    return {
      kind: 'error',
      error,
      fallback: 'The member list could not be loaded.',
      onRetry,
    };
  if (noMatch !== null)
    return {
      kind: 'empty',
      icon: SearchX,
      heading: `No members match “${noMatch}”.`,
      headingLevel: 3,
    };
  return undefined;
}

/**
 * The workspace roster, with its search and invite on the table's own header.
 * The Owner row is inert: the single designated Owner changes only through a
 * transfer, which swaps both roles in one server transaction, so no control
 * here can leave the workspace ownerless. Every control reports an intent; the
 * caller confirms it before anything changes. Transfer is offered only to the
 * Owner (`onTransfer` absent otherwise), and your own row offers nothing:
 * leaving is a workspace action, not a removal.
 */
export function MemberRoster({
  members,
  toolbar,
  noMatch,
  isLoading,
  isError,
  error,
  busy,
  onRetry,
  onChangeRole,
  onTransfer,
  onRemove,
}: Readonly<{
  members: readonly WorkspaceMember[];
  /** The roster's search and invite. */
  toolbar: FilterBarProps;
  /** The search text when it matches nobody; null otherwise. */
  noMatch: string | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  busy: boolean;
  onRetry: () => void;
  onChangeRole: (member: WorkspaceMember, role: AssignableWorkspaceRole) => void;
  onTransfer?: (member: WorkspaceMember) => void;
  onRemove: (member: WorkspaceMember) => void;
}>) {
  return (
    <DataTable
      label="Members"
      toolbar={toolbar}
      columns={COLUMNS}
      state={rosterState({ isLoading, isError, error, onRetry, noMatch })}
    >
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
    </DataTable>
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
  onChangeRole: (member: WorkspaceMember, role: AssignableWorkspaceRole) => void;
  onTransfer?: (member: WorkspaceMember) => void;
  onRemove: (member: WorkspaceMember) => void;
}>) {
  const inert = member.role === 'owner' || member.is_self;
  return (
    <TableRow>
      <TableCell>
        <Inline>
          <Avatar name={member.email} />
          <ClampText lines={1}>{member.email}</ClampText>
          {member.is_self ? <Badge variant="neutral">You</Badge> : null}
        </Inline>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {inert ? (
          <Badge variant="neutral">{roleLabel(member.role)}</Badge>
        ) : (
          <Select
            value={member.role as AssignableWorkspaceRole}
            onValueChange={(next) => onChangeRole(member, next)}
            options={ROLE_OPTIONS}
            ariaLabel={`Role for ${member.email}`}
            disabled={busy}
          />
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Inline className="justify-end">
          {inert ? null : (
            <>
              {onTransfer ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onTransfer(member)}
                >
                  Make owner
                </Button>
              ) : null}
              <Tooltip content={`Remove ${member.email}`}>
                <IconButton
                  icon={Trash2}
                  variant="destructiveGhost"
                  label={`Remove ${member.email} from this workspace`}
                  disabled={busy}
                  onClick={() => onRemove(member)}
                />
              </Tooltip>
            </>
          )}
        </Inline>
      </TableCell>
    </TableRow>
  );
}
