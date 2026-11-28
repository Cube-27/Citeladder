import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/tag';
import { Button, IconButton } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { queryTableState, type TableRead } from '@/components/ui/state-block';
import type { TableToolbarProps } from '@/components/ui/filter-bar';
import { Inline } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { ClampText } from '@/components/ui/clamp-text';
import { TableActionsCell, TableCell, TableRow, YouTag } from '@/components/ui/table';
import { SearchX, Trash2 } from '@/lib/icons';
import {
  ASSIGNABLE_WORKSPACE_ROLES,
  type AssignableWorkspaceRole,
  type WorkspaceMember,
} from '@/lib/api/workspaces';
import { isOneOf } from '@/lib/utils';

import { ROLE_OPTIONS, roleLabel } from './member-roles';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'member', label: 'Member', kind: 'identity' },
  { key: 'role', label: 'Workspace role', kind: 'status', width: 'category' },
  { key: 'actions', label: 'Actions', kind: 'actions', width: 'rowActions', hideLabel: true },
];

function rosterState(read: TableRead<unknown>, noMatch: string | null) {
  return queryTableState(read, {
    subject: 'members',
    empty: () =>
      noMatch === null
        ? undefined
        : {
            kind: 'empty',
            icon: SearchX,
            heading: `No members match “${noMatch}”`,
            headingLevel: 3,
          },
  });
}

export function MemberRoster({
  members,
  toolbar,
  noMatch,
  read,
  busy,
  onChangeRole,
  onTransfer,
  onRemove,
}: Readonly<{
  members: readonly WorkspaceMember[];
  toolbar: TableToolbarProps;
  noMatch: string | null;
  read: TableRead<unknown>;
  busy: boolean;
  onChangeRole: (member: WorkspaceMember, role: AssignableWorkspaceRole) => void;
  onTransfer?: (member: WorkspaceMember) => void;
  onRemove: (member: WorkspaceMember) => void;
}>) {
  return (
    <DataTable label="Members" toolbar={toolbar} columns={COLUMNS} {...rosterState(read, noMatch)}>
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
          {member.is_self ? <YouTag /> : null}
        </Inline>
      </TableCell>
      <TableCell wrap="nowrap">
        {inert || !isOneOf(ASSIGNABLE_WORKSPACE_ROLES, member.role) ? (
          <Tag>{roleLabel(member.role)}</Tag>
        ) : (
          <Select
            value={member.role}
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
