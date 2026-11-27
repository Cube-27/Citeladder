import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import {
  factTopicSchema,
  type BrandFact,
  type FactTopic,
} from '@citeladder/contracts/fact-checking';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { projectMutations } from '@/lib/api/projects';
import { TOPIC_LABELS } from '@/lib/visibility/accuracy';

const TOPIC_OPTIONS = factTopicSchema.options.map((topic) => ({
  value: topic,
  label: TOPIC_LABELS[topic],
}));

export type FactEdit = { kind: 'add' } | { kind: 'edit'; fact: BrandFact };

type Draft = { topic: FactTopic; statement: string; source_url: string };

function initialDraft(edit: FactEdit): Draft {
  switch (edit.kind) {
    case 'add':
      return { topic: 'pricing', statement: '', source_url: '' };
    case 'edit':
      return {
        topic: edit.fact.topic,
        statement: edit.fact.statement,
        source_url: edit.fact.source_url ?? '',
      };
    default: {
      const unhandled: never = edit;
      return unhandled;
    }
  }
}

export function BrandFactDialog({
  scope,
  edit,
  maxChars,
  onClose,
}: Readonly<{
  scope: { workspaceId: string; projectId: string };
  edit: FactEdit;
  maxChars: number;
  onClose: () => void;
}>) {
  const create = useMutation(projectMutations.createBrandFact(scope));
  const update = useMutation(projectMutations.updateBrandFact(scope));
  const [draft, setDraft] = useState(() => initialDraft(edit));
  const fields = {
    topic: draft.topic,
    statement: draft.statement.trim(),
    source_url: draft.source_url.trim() || null,
  };
  const save = () =>
    edit.kind === 'add'
      ? create.mutate({ ...fields, status: 'confirmed' }, { onSuccess: onClose })
      : update.mutate(
          { factId: edit.fact.id, input: { expected_revision: edit.fact.revision, ...fields } },
          { onSuccess: onClose },
        );
  const mutation = edit.kind === 'add' ? create : update;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={edit.kind === 'add' ? 'Add fact' : 'Edit fact'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            pending={mutation.isPending}
            disabled={!fields.statement}
            onClick={save}
          >
            Save fact
          </Button>
        </>
      }
    >
      {mutation.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(mutation.error, { action: 'save the fact' })}
        />
      ) : null}
      <Stack gap="workspace">
        <Field label="Topic">
          {(props) => (
            <Select
              id={props.id}
              value={draft.topic}
              options={TOPIC_OPTIONS}
              onValueChange={(topic) => setDraft({ ...draft, topic })}
            />
          )}
        </Field>
        <Field label="Fact" count={{ used: draft.statement.length, max: maxChars }}>
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              maxLength={maxChars}
              value={draft.statement}
              onChange={(event) => setDraft({ ...draft, statement: event.target.value })}
            />
          )}
        </Field>
        <Field label="Source page" hint="Optional">
          {(props) => (
            <Input
              {...props}
              type="url"
              placeholder="https://"
              value={draft.source_url}
              onChange={(event) => setDraft({ ...draft, source_url: event.target.value })}
            />
          )}
        </Field>
      </Stack>
    </Dialog>
  );
}
