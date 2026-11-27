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
import { Inline } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { SettingsGroup } from '@/components/ui/setting-row';
import { useToast } from '@/components/ui/toast';
import { StatusMark } from '@/components/ui/status-mark';
import { TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { projectMutations } from '@/lib/api/projects';
import { shortUrlTitle } from '@/lib/format';
import { Archive, Check, Pencil, Plus } from '@/lib/icons';
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
  const restore = useMutation(projectMutations.createBrandFact(scope));
  const toast = useToast();
  const [editing, setEditing] = useState<FactEdit | null>(null);
  const [retiring, setRetiring] = useState<BrandFact | null>(null);
  const undoRetire = (fact: BrandFact) =>
    restore.mutate(
      {
        topic: fact.topic,
        statement: fact.statement,
        source_url: fact.source_url,
        status: fact.status === 'confirmed' ? 'confirmed' : 'draft',
      },
      {
        onError: (error) =>
          toast.notify(
            "Couldn't restore the fact",
            mutationNoticeForError(error, { action: 'restore the fact' }).message,
            { tone: 'negative' },
          ),
      },
    );
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
      {change.isError && !retiring ? (
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
                    icon={Archive}
                    label="Retire fact"
                    onClick={() => {
                      change.reset();
                      setRetiring(fact);
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
          setRetiring(null);
        }}
        request={
          retiring && {
            question: 'Retire fact',
            body: (
              <>
                {change.isError ? (
                  <Notice
                    kind="mutation"
                    notice={mutationNoticeForError(change.error, { action: 'retire the fact' })}
                  />
                ) : null}
                {retiring.statement}
              </>
            ),
            confirmLabel: 'Retire fact',
            destructive: true,
            onConfirm: () =>
              change.mutate(
                {
                  factId: retiring.id,
                  input: { expected_revision: retiring.revision, status: 'retired' },
                },
                {
                  onSuccess: () => {
                    setRetiring(null);
                    toast.notify('Fact retired', undefined, {
                      actions: [{ label: 'Undo', onClick: () => undoRetire(retiring) }],
                    });
                  },
                },
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
        <Inline as="span" wrap>
          {fact.statement}
          {fact.status === 'draft' ? (
            <StatusMark variant="status" value="warning">
              Draft
            </StatusMark>
          ) : null}
        </Inline>
      </TableCell>
      <TableCell>{TOPIC_LABELS[fact.topic]}</TableCell>
      <TableCell>
        {fact.source_url ? (
          <ExternalHttpLink
            href={fact.source_url}
            title={fact.source_url}
            className="block min-w-0"
            truncate
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
