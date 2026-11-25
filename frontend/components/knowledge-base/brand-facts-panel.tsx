import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import type { BrandFact, BrandFactList } from '@citeladder/contracts/fact-checking';

import { BrandFactDialog, type FactEdit } from '@/components/knowledge-base/brand-fact-dialog';
import { Absence } from '@/components/ui/absence';
import { Button, IconButton } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/notice';
import { SettingsGroup } from '@/components/ui/setting-row';
import { StatusMark } from '@/components/ui/status-mark';
import { TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { projectMutations } from '@/lib/api/projects';
import { shortUrlTitle } from '@/lib/format';
import { Check, Pencil, Plus, Trash2 } from '@/lib/icons';
import { TOPIC_LABELS } from '@/lib/visibility/accuracy';

const COLUMNS = [
  { key: 'fact', label: 'Fact', kind: 'identity' },
  { key: 'topic', label: 'Topic', width: 'category' },
  { key: 'source', label: 'Source', width: 'name', priority: 'low' },
] as const satisfies readonly DataTableColumn[];

const EDIT_COLUMNS = [
  ...COLUMNS,
  { key: 'actions', label: 'Fact actions', kind: 'actions', hideLabel: true },
] as const satisfies readonly DataTableColumn[];

export function BrandFactsPanel({
  workspaceId,
  projectId,
  list,
  mayEdit,
}: Readonly<{ workspaceId: string; projectId: string; list: BrandFactList; mayEdit: boolean }>) {
  const scope = { workspaceId, projectId };
  const change = useMutation(projectMutations.updateBrandFact(scope));
  const [editing, setEditing] = useState<FactEdit | null>(null);
  const [deleting, setDeleting] = useState<BrandFact | null>(null);
  const facts = list.facts.filter((fact) => fact.status !== 'retired');
  const confirm = (fact: BrandFact) =>
    change.mutate({
      factId: fact.id,
      input: { expected_revision: fact.revision, status: 'confirmed' },
    });
  return (
    <SettingsGroup
      title="Brand facts"
      action={
        mayEdit ? (
          <Button onClick={() => setEditing({ kind: 'add' })}>
            <Icon icon={Plus} />
            Add fact
          </Button>
        ) : undefined
      }
    >
      {change.isError && !deleting ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(change.error, { action: 'update the fact' })}
        />
      ) : null}
      <DataTable
        label="Brand facts"
        columns={mayEdit ? EDIT_COLUMNS : COLUMNS}
        rowCount={facts.length}
        state={facts.length ? undefined : { kind: 'empty', inline: true, message: 'No facts yet.' }}
      >
        {facts.map((fact) => (
          <FactRow
            key={fact.id}
            fact={fact}
            actions={
              mayEdit ? (
                <TableActionsCell>
                  {fact.status === 'draft' ? (
                    <IconButton
                      icon={Check}
                      label="Confirm fact"
                      disabled={change.isPending}
                      onClick={() => confirm(fact)}
                    />
                  ) : null}
                  <IconButton
                    icon={Pencil}
                    label="Edit fact"
                    onClick={() => setEditing({ kind: 'edit', fact })}
                  />
                  <IconButton
                    icon={Trash2}
                    label="Delete fact"
                    onClick={() => {
                      change.reset();
                      setDeleting(fact);
                    }}
                  />
                </TableActionsCell>
              ) : null
            }
          />
        ))}
      </DataTable>
      {editing ? (
        <BrandFactDialog
          key={editing.kind === 'edit' ? editing.fact.id : 'add'}
          scope={scope}
          edit={editing}
          maxChars={list.limits.statement_max_chars}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        pending={change.isPending}
        onCancel={() => {
          change.reset();
          setDeleting(null);
        }}
        request={
          deleting && {
            title: 'Delete fact?',
            body: (
              <>
                {change.isError ? (
                  <Notice
                    kind="mutation"
                    notice={mutationNoticeForError(change.error, { action: 'delete the fact' })}
                  />
                ) : null}
                {deleting.statement}
              </>
            ),
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: () =>
              change.mutate(
                {
                  factId: deleting.id,
                  input: { expected_revision: deleting.revision, status: 'retired' },
                },
                { onSuccess: () => setDeleting(null) },
              ),
          }
        }
      />
    </SettingsGroup>
  );
}

function FactRow({ fact, actions }: Readonly<{ fact: BrandFact; actions: ReactNode }>) {
  return (
    <TableRow>
      <TableCell>
        {fact.statement}
        {fact.status === 'draft' ? (
          <StatusMark variant="status" value="warning" className="ms-2">
            Draft
          </StatusMark>
        ) : null}
      </TableCell>
      <TableCell>{TOPIC_LABELS[fact.topic]}</TableCell>
      <TableCell>
        {fact.source_url ? (
          <ExternalHttpLink
            href={fact.source_url}
            title={fact.source_url}
            className="block min-w-0 truncate"
          >
            {shortUrlTitle(fact.source_url)}
          </ExternalHttpLink>
        ) : (
          <Absence label="No source page" />
        )}
      </TableCell>
      {actions}
    </TableRow>
  );
}
