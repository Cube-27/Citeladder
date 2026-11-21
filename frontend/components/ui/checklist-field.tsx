import { useId, useState, type ReactNode } from 'react';

import { Button, IconButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Pencil, X } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * FieldGroup — a question made of several controls: a `fieldset` named by
 * its label (14/20 medium `ink`), with an optional tabular count
 * at its right, a help line under it, the controls, and a note after them
 * (why the step cannot continue yet).
 */
export function FieldGroup({
  label,
  help,
  count,
  note,
  children,
}: Readonly<{
  label: string;
  help?: ReactNode;
  /** "2 of 5": what is selected, in tabular `ink-2`. */
  count?: string;
  /** Why the step cannot continue, in `warning`. */
  note?: ReactNode;
  children: ReactNode;
}>) {
  const labelId = useId();
  return (
    <fieldset aria-labelledby={labelId} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span id={labelId} className="text-body-sm text-ink">
            {label}
          </span>
          {count ? (
            <span className="text-caption text-ink-2 whitespace-nowrap tabular-nums">{count}</span>
          ) : null}
        </div>
        {help ? <p className="text-body-sm text-ink-2">{help}</p> : null}
      </div>
      {children}
      {note ? <p className="text-caption text-warning">{note}</p> : null}
    </fieldset>
  );
}

export type ChecklistItem = Readonly<{
  id: string;
  label: string;
  description?: string;
  /** A short fact at the row's end (a domain beside a name). */
  meta?: string;
  /** A 20px mark before the label: a BrandMark, an EngineMark in `ink`. */
  leading?: ReactNode;
  checked: boolean;
  /** Checking is unavailable (a limit is reached); unchecking stays available. */
  disabled?: boolean;
  /** Offers the pencil, when the field has an editor. */
  editable?: boolean;
  /** Content kept beside the row for assistive tech (a visually hidden link). */
  extra?: ReactNode;
}>;

export type ChecklistEditor<K extends string> = Readonly<{
  fields: readonly Readonly<{
    key: K;
    label: (item: ChecklistItem) => string;
    placeholder: string;
  }>[];
  /** Each field's starting value for this row. */
  values: (item: ChecklistItem) => Readonly<Record<K, string>>;
  /** Save is offered once every field has a value; values arrive trimmed. */
  onSave: (id: string, values: Readonly<Record<K, string>>) => void;
  onCancel?: (id: string) => void;
  /** The pencil's accessible name. */
  editLabel: (item: ChecklistItem) => string;
}>;

/**
 * ChecklistField — a bordered list of checkable rows (52px; 68px with
 * descriptions) under a FieldGroup head, one row editable in place. The
 * editing row swaps the row for its fields with Save (ink) and Cancel (ghost)
 * at the same height. Rows never reorder on check; labels end in an ellipsis.
 */
export function ChecklistField<K extends string>({
  label,
  help,
  count,
  note,
  items,
  onToggle,
  editor,
  editingId = null,
  onEditingChange,
  empty,
  footer,
}: Readonly<{
  label: string;
  help?: ReactNode;
  count?: string;
  note?: ReactNode;
  items: readonly ChecklistItem[];
  onToggle: (id: string) => void;
  editor?: ChecklistEditor<K>;
  editingId?: string | null;
  onEditingChange?: (id: string | null) => void;
  /** Said in place of the list when there are no rows. */
  empty: ReactNode;
  /** Actions under the list (Add). */
  footer?: ReactNode;
}>) {
  const tall = items.some((item) => item.description);
  return (
    <FieldGroup label={label} help={help} count={count} note={note}>
      {items.length === 0 ? (
        <p className="text-body-sm text-ink-2">{empty}</p>
      ) : (
        <ul className="bg-surface border-rule divide-rule rounded-control divide-y border">
          {items.map((item) =>
            editor && item.id === editingId ? (
              <EditRow
                key={item.id}
                item={item}
                editor={editor}
                onDone={() => onEditingChange?.(null)}
              />
            ) : (
              <CheckRow
                key={item.id}
                item={item}
                tall={tall}
                onToggle={() => onToggle(item.id)}
                onEdit={
                  editor && item.editable
                    ? { label: editor.editLabel(item), start: () => onEditingChange?.(item.id) }
                    : undefined
                }
              />
            ),
          )}
        </ul>
      )}
      {footer ? <div className="flex flex-wrap items-center gap-2">{footer}</div> : null}
    </FieldGroup>
  );
}

function CheckRow({
  item,
  tall,
  onToggle,
  onEdit,
}: Readonly<{
  item: ChecklistItem;
  tall: boolean;
  onToggle: () => void;
  onEdit?: { label: string; start: () => void };
}>) {
  return (
    <li
      className={cn(
        'desktop:pl-4 flex items-center gap-3 pr-2 pl-3',
        tall ? 'min-h-17' : 'min-h-13',
      )}
    >
      <Checkbox
        checked={item.checked}
        onCheckedChange={onToggle}
        disabled={item.disabled && !item.checked}
        className="min-w-0 flex-1"
        label={
          <span className="flex min-w-0 items-center gap-2">
            {item.leading}
            <span className="truncate">{item.label}</span>
          </span>
        }
        description={
          item.description ? <span className="block truncate">{item.description}</span> : undefined
        }
      />
      {item.meta ? (
        <span className="text-caption text-ink-2 shrink-0 tabular-nums">{item.meta}</span>
      ) : null}
      {onEdit ? <IconButton icon={Pencil} label={onEdit.label} onClick={onEdit.start} /> : null}
      {item.extra}
    </li>
  );
}

function EditRow<K extends string>({
  item,
  editor,
  onDone,
}: Readonly<{ item: ChecklistItem; editor: ChecklistEditor<K>; onDone: () => void }>) {
  const [draft, setDraft] = useState<Readonly<Record<K, string>>>(() => editor.values(item));
  const complete = editor.fields.every((field) => draft[field.key].trim() !== '');
  const save = () => {
    if (!complete) return;
    const trimmed: Record<K, string> = { ...draft };
    for (const field of editor.fields) trimmed[field.key] = draft[field.key].trim();
    editor.onSave(item.id, trimmed);
    onDone();
  };
  const cancel = () => {
    editor.onCancel?.(item.id);
    onDone();
  };
  return (
    <li className="desktop:pl-4 flex min-h-13 flex-wrap items-center gap-2 py-2 pr-2 pl-3">
      {editor.fields.map((field, index) => (
        <Input
          key={field.key}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- Edit and Add explicitly reveal these fields.
          autoFocus={index === 0}
          aria-label={field.label(item)}
          placeholder={field.placeholder}
          value={draft[field.key]}
          onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
          className="min-w-0 flex-1 basis-32"
        />
      ))}
      <Button variant="quiet" onClick={cancel}>
        <Icon icon={X} />
        Cancel
      </Button>
      <Button variant="primary" onClick={save} disabled={!complete}>
        Save
      </Button>
    </li>
  );
}
