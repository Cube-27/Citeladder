'use client';

import { SendHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { Textarea } from '@/components/ui/textarea';
import { textRole } from '@/components/ui/typography';
import type { ContextChip } from '@/lib/agent/handoff';

/**
 * The message box every Agent surface shares. Enter sends, Shift+Enter adds a
 * line. Context chips show the typed references the turn will carry; optional
 * ones can be removed before sending.
 */
export function Composer({
  id,
  label,
  value,
  onChange,
  onSubmit,
  pending,
  disabled,
  placeholder,
  chips = [],
  onRemoveChip,
  tools,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  disabled: boolean;
  placeholder: string;
  chips?: ContextChip[];
  onRemoveChip?: (chip: ContextChip) => void;
  tools?: ReactNode;
}>) {
  const canSend = !disabled && !pending && value.trim().length > 0;
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      {chips.length > 0 ? (
        <ul aria-label="Context for this request" className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li
              key={chip.key}
              className="bg-background-alt text-secondary inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5"
            >
              <span className={textRole('meta', 'truncate text-secondary')}>{chip.label}</span>
              {onRemoveChip ? (
                <Pressable
                  className="focus-ring hover:text-foreground rounded-full"
                  aria-label={`Remove ${chip.label}`}
                  onClick={() => onRemoveChip(chip)}
                >
                  <X className="size-3" aria-hidden />
                </Pressable>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Textarea
        id={id}
        raised
        rows={3}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (canSend) onSubmit();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">{tools}</div>
        <Button type="submit" disabled={!canSend}>
          <SendHorizontal className="size-4" aria-hidden />
          {pending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
