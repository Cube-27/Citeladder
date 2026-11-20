import { Check, X } from 'lucide-react';
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

import { Icon } from '@/components/ui/icon';
import { FIELD_EDGE } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** One value, and whether it is still a model's or discovery's unaccepted suggestion. */
export type ChipItem = Readonly<{ value: string; suggested?: boolean }>;

const sameValue = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** `items` with each new value appended once (any case), up to `max`. */
function appended(items: readonly ChipItem[], values: readonly string[], max?: number) {
  const next = [...items];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || next.some((item) => sameValue(item.value, value))) continue;
    if (max !== undefined && next.length >= max) break;
    next.push({ value });
  }
  return next;
}

/** The keys that add a typed value, and how a pasted text splits into values. */
const SEPARATORS = {
  line: { keys: ['Enter'], split: /[\n\r]+/ },
  comma: { keys: ['Enter', ','], split: /[\n\r,]+/ },
} as const satisfies Record<string, { keys: readonly string[]; split: RegExp }>;

const TOKEN_REMOVE =
  'focus-ring text-ink-2 hover:text-ink grid size-4 shrink-0 place-items-center rounded-mark opacity-0 transition-opacity group-hover/token:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 disabled:hidden';

/**
 * ValuesInput — several short values in one box: each a token, then an add
 * field filling the rest of the line. Enter (and a comma, with `separates="comma"`)
 * adds what was typed; leaving the field adds it too; pasting several lines
 * (or comma-separated values) adds each. Backspace in the empty field removes
 * the last token; ArrowLeft walks the tokens, where Delete removes one, so
 * Tab only ever moves between fields. A suggestion is drawn dashed; `onAccept`
 * offers one tick that accepts the box's suggestions. `cell` drops the edge
 * for a grid cell, which shows its frame only while focused.
 */
export function ValuesInput({
  label,
  items,
  onChange,
  onAccept,
  max,
  disabled,
  placeholder,
  separates = 'line',
  variant = 'field',
  pending: heldPending,
  onPendingChange,
}: Readonly<{
  /** Names the values; the add field is "Add to …". */
  label: string;
  items: readonly ChipItem[];
  onChange: (items: ChipItem[]) => void;
  /** Accepts this box's suggestions; offered only while it holds one. */
  onAccept?: () => void;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
  /** What ends a value: a line (Enter, pasted lines), or also a comma. */
  separates?: keyof typeof SEPARATORS;
  variant?: 'field' | 'cell';
  /** The typed value, when the owner holds it. */
  pending?: string;
  onPendingChange?: (value: string) => void;
}>) {
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [ownPending, setOwnPending] = useState('');
  const pending = heldPending ?? ownPending;
  const setPending = onPendingChange ?? setOwnPending;
  const full = max !== undefined && items.length >= max;
  const separator = SEPARATORS[separates];

  const add = () => {
    const next = appended(items, [pending], max);
    if (next.length === items.length) return;
    onChange(next);
    setPending('');
  };
  const removers = () => [
    ...(box.current?.querySelectorAll<HTMLButtonElement>('[data-token-remove]') ?? []),
  ];
  const removeAt = (index: number) => {
    onChange(items.filter((_, position) => position !== index));
    const before = removers()[index - 1];
    if (before) before.focus();
    else field.current?.focus();
  };
  const onFieldKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (separator.keys.includes(event.key)) {
      event.preventDefault();
      add();
    } else if (event.key === 'Backspace' && pending === '' && items.length) {
      event.preventDefault();
      onChange(items.slice(0, -1));
    } else if (event.key === 'ArrowLeft' && event.currentTarget.selectionStart === 0) {
      const last = removers().at(-1);
      if (last) {
        event.preventDefault();
        last.focus();
      }
    }
  };
  const onTokenKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const all = removers();
    if (event.key === 'ArrowLeft') all[index - 1]?.focus();
    else if (event.key === 'ArrowRight') (all[index + 1] ?? field.current)?.focus();
    else if (event.key === 'Backspace' || event.key === 'Delete') removeAt(index);
    else return;
    event.preventDefault();
  };
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const parts = event.clipboardData.getData('text').split(separator.split);
    if (parts.length < 2) return;
    event.preventDefault();
    onChange(appended(items, [pending, ...parts], max));
    setPending('');
  };
  const accepting = onAccept !== undefined && items.some((item) => item.suggested);

  return (
    // The add field grows to fill the rest of its line, so a press there lands in it.
    <div ref={box} className={boxClasses({ variant, accepting, disabled })}>
      {items.length ? (
        <ul aria-label={label} className="contents">
          {items.map((item, index) => (
            <Token
              key={item.value}
              item={item}
              disabled={disabled}
              onRemove={() => removeAt(index)}
              onKeyDown={(event) => onTokenKey(event, index)}
            />
          ))}
        </ul>
      ) : null}
      <input
        ref={field}
        aria-label={`Add to ${label}`}
        value={pending}
        placeholder={items.length ? undefined : placeholder}
        disabled={disabled || full}
        onChange={(event) => setPending(event.target.value)}
        onBlur={add}
        onKeyDown={onFieldKey}
        onPaste={onPaste}
        className="text-ink placeholder:text-ink-2 type-body min-h-6 w-8 min-w-8 flex-1 bg-transparent px-1 disabled:cursor-not-allowed"
      />
      {accepting ? <AcceptTick label={label} disabled={disabled} onAccept={onAccept} /> : null}
    </div>
  );
}

/** A field's box, or a grid cell's edgeless one; room is kept for the accept tick. */
function boxClasses({
  variant,
  accepting,
  disabled,
}: Readonly<{ variant: 'field' | 'cell'; accepting: boolean; disabled?: boolean }>) {
  return cn(
    'focus-frame relative flex w-full min-w-0 cursor-text flex-wrap items-center gap-1 rounded-control p-1 transition-[border-color,box-shadow]',
    accepting && 'pe-8',
    variant === 'field'
      ? cn('min-h-[var(--control-md)]', FIELD_EDGE)
      : 'min-h-10 border border-transparent hover:bg-state-hover',
    disabled && 'cursor-not-allowed opacity-45',
  );
}

/** One value; its remove button is reached by the arrow keys, not Tab. */
function Token({
  item,
  disabled,
  onRemove,
  onKeyDown,
}: Readonly<{
  item: ChipItem;
  disabled?: boolean;
  onRemove: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}>) {
  return (
    <li
      className={cn(
        'group/token type-body rounded-mark inline-flex h-6 max-w-full items-center gap-1 ps-1.5 pe-1 whitespace-nowrap',
        item.suggested ? 'border-control-line border border-dashed' : 'bg-state-selected',
      )}
    >
      <span className="min-w-0 truncate" title={item.value}>
        {item.value}
        {item.suggested ? <span className="sr-only"> (suggested)</span> : null}
      </span>
      <button
        type="button"
        data-token-remove=""
        tabIndex={-1}
        aria-label={`Remove ${item.value}`}
        disabled={disabled}
        onClick={onRemove}
        onKeyDown={onKeyDown}
        className={TOKEN_REMOVE}
      >
        <Icon icon={X} className="my-0" />
      </button>
    </li>
  );
}

/** The box's one accept, in its top corner, clear of the wrapping tokens. */
function AcceptTick({
  label,
  disabled,
  onAccept,
}: Readonly<{ label: string; disabled?: boolean; onAccept?: () => void }>) {
  return (
    <button
      type="button"
      aria-label={`Accept ${label}`}
      disabled={disabled}
      onClick={onAccept}
      className="focus-ring hit-area text-ink-2 hover:text-ink hover:overlay-hover rounded-control absolute end-1 top-1 grid size-6 place-items-center"
    >
      <Icon icon={Check} className="my-0" />
    </button>
  );
}

/**
 * ChipInput — a named group of short values: its legend, the ValuesInput and,
 * with `max`, an "n/max" counter. A value is one entry however many commas it
 * holds, so a category such as "bays for golf courses, and community centres"
 * stays one.
 */
export function ChipInput({
  label,
  max,
  ...input
}: Readonly<Omit<Parameters<typeof ValuesInput>[0], 'variant' | 'separates'>>) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-body-sm text-ink mb-2">{label}</legend>
      <ValuesInput label={label} max={max} {...input} />
      {max !== undefined ? (
        <span
          className={cn(
            'ms-auto text-caption tabular-nums',
            input.items.length >= max ? 'text-ink' : 'text-ink-2',
          )}
        >
          {`${input.items.length}/${max}`}
        </span>
      ) : null}
    </fieldset>
  );
}
