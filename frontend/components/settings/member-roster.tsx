import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/tag';
import { Button, IconButton } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import type { FilterBarProps } from '@/components/ui/filter-bar';
import { Inline } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { ClampText } from '@/components/ui/clamp-text';
import { TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import { SearchX, Trash2 } from '@/lib/icons';
import type { AssignableWorkspaceRole, WorkspaceMember } from '@/lib/api/workspaces';

import { ROLE_OPTIONS, roleLabel } from './member-roles';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'member', label: 'Member', kind: 'identity' },
  { key: 'role', label: 'Workspace role', kind: 'status', width: 'category' },
  { key: 'actions', label: 'Actions', kind: 'actions', width: 'rowActions', hideLabel: true },
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
      title: "Couldn't load members",
      error,
      fallback: 'The member list could not be loaded.',
      onRetry,
    };
  if (noMatch !== null)
    return {
      kind: 'empty',
      icon: SearchX,
      heading: `No members match “${noMatch}”`,
      headingLevel: 3,
    };
  return undefined;
}

/**
 * The workspace roster, with its search on the table's own header.
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
  /** The roster's search. */
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
          {member.is_self ? <Tag>You</Tag> : null}
        </Inline>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {inert ? (
          <Tag>{roleLabel(member.role)}</Tag>
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
      <TableActionsCell>
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
            <IconButton
              icon={Trash2}
              label={`Remove ${member.email} from this workspace`}
              disabled={busy}
              onClick={() => onRemove(member)}
            />
          </>
        )}
      </TableActionsCell>
    </TableRow>
  );
}
