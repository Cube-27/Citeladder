import { useState } from 'react';

import { Plus } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Inline } from '@/components/ui/layout';
import { SettingField, SettingRow, RowAction } from '@/components/ui/setting-row';
import { Text } from '@/components/ui/typography';

export function AddNameForm({
  title,
  field,
  submit: submitLabel,
  pending,
  onAdd,
}: Readonly<{
  title: string;
  field: string;
  submit: string;
  pending: boolean;
  onAdd: (name: string) => Promise<unknown>;
}>) {
  const [draft, setDraft] = useState('');
  const submit = async () => {
    const sent = draft;
    try {
      await onAdd(sent.trim());
    } catch {
      return;
    }
    setDraft((current) => (current === sent ? '' : current));
  };
  const empty = !draft.trim();
  return (
    <form
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || empty) return;
        void submit();
      }}
    >
      <SettingField label={field} inline="fill">
        {(props) => (
          <Inline wrap justify="end">
            <Input
              {...props}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              width="name"
            />
            <Button type="submit" disabled={pending || empty}>
              <Icon icon={Plus} />
              {submitLabel}
            </Button>
          </Inline>
        )}
      </SettingField>
    </form>
  );
}

export function EditableNameRow({
  name,
  verb,
  mayEdit,
  pending,
  onSave,
  onDelete,
}: Readonly<{
  name: string;
  verb: string;
  mayEdit: boolean;
  pending: boolean;
  onSave: (name: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}>) {
  const [editing, setEditing] = useState<string | null>(null);
  const label =
    editing === null ? (
      <Text variant="body">{name}</Text>
    ) : (
      <Input
        aria-label={`${verb} ${name}`}
        value={editing}
        onChange={(event) => setEditing(event.target.value)}
      />
    );
  if (!mayEdit) return <SettingRow label={label} />;
  const actions =
    editing === null ? (
      <Inline as="span" gap="tight">
        <RowAction kind="edit" label={`${verb} ${name}`} onClick={() => setEditing(name)} />
        <RowAction
          kind="delete"
          label={`Delete ${name}`}
          disabled={pending}
          onClick={() => void onDelete().catch(() => undefined)}
        />
      </Inline>
    ) : (
      <Inline as="span" gap="tight">
        <RowAction kind="cancel" label="Cancel" onClick={() => setEditing(null)} />
        <RowAction
          kind="save"
          label="Save"
          disabled={pending || !editing.trim()}
          onClick={() => {
            const sent = editing;
            onSave(sent.trim()).then(
              () => setEditing((current) => (current === sent ? null : current)),
              () => undefined,
            );
          }}
        />
      </Inline>
    );
  return <SettingRow label={label} action={actions} />;
}
