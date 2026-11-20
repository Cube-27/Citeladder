import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Inline } from '@/components/ui/layout';
import { SettingField, SettingRow, SettingRows } from '@/components/ui/setting-row';
import { textRole } from '@/components/ui/typography';

/** Context's add form for one short name, such as an alias or a theme. */
export function AddNameForm({
  title,
  titleId,
  field,
  submit: submitLabel,
  pending,
  onAdd,
}: Readonly<{
  title: string;
  titleId: string;
  field: string;
  submit: string;
  pending: boolean;
  onAdd: (name: string) => Promise<unknown>;
}>) {
  const [draft, setDraft] = useState('');
  // A refused name stays in the field; only a saved one clears it.
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
      aria-labelledby={titleId}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || empty) return;
        void submit();
      }}
    >
      <SettingRows title={title} titleId={titleId}>
        <SettingField label={field}>
          {(props) => (
            <Input {...props} value={draft} onChange={(event) => setDraft(event.target.value)} />
          )}
        </SettingField>
        <Inline className="flex-wrap justify-end">
          <Button type="submit" variant="primary" disabled={pending || empty}>
            <Icon icon={Plus} />
            {submitLabel}
          </Button>
        </Inline>
      </SettingRows>
    </form>
  );
}

/** One saved name, edited inline and deleted in place; read-only without `mayEdit`. */
export function EditableNameRow({
  name,
  verb,
  mayEdit,
  pending,
  onSave,
  onDelete,
}: Readonly<{
  name: string;
  /** The edit button's word, such as Edit or Rename. */
  verb: string;
  mayEdit: boolean;
  pending: boolean;
  onSave: (name: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}>) {
  const [editing, setEditing] = useState<string | null>(null);
  const label =
    editing === null ? (
      <span className={textRole('body')}>{name}</span>
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
      <Inline as="span" className="flex-wrap">
        <Button variant="secondary" aria-label={`${verb} ${name}`} onClick={() => setEditing(name)}>
          <Icon icon={Pencil} />
          {verb}
        </Button>
        <Button
          variant="quiet"
          disabled={pending}
          aria-label={`Delete ${name}`}
          onClick={() => void onDelete().catch(() => undefined)}
        >
          <Icon icon={Trash2} />
          Delete
        </Button>
      </Inline>
    ) : (
      <Inline as="span" className="flex-wrap">
        <Button variant="quiet" onClick={() => setEditing(null)}>
          <Icon icon={X} />
          Cancel
        </Button>
        <Button
          variant="secondary"
          disabled={pending || !editing.trim()}
          onClick={() => {
            // The draft stays open until the save lands, so a failed save loses nothing.
            onSave(editing.trim()).then(
              () => setEditing(null),
              () => undefined,
            );
          }}
        >
          <Icon icon={Save} />
          Save
        </Button>
      </Inline>
    );
  return <SettingRow label={label} action={actions} />;
}
