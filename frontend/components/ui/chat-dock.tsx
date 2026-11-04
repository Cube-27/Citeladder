'use client';

import { X } from 'lucide-react';
import type { FormEvent, ReactNode, RefObject } from 'react';

import { Icon } from '@/components/ui/icon';
import { menuItemVariants, menuPanelClasses } from '@/components/ui/menu-variants';
import { Pressable } from '@/components/ui/pressable';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The chat template: a thread that scrolls in its own region and a composer
 * docked under that region, so only the thread moves while a reply streams.
 * A chat route gets it from `ListScreen fill` with a `ComposerDock` as its
 * `dock`; the panel uses `DockedThread` (give that `Drawer` the `dock` body).
 *
 * `DockedThread` is the panel's column: the thread's parts 16 apart in a
 * region that scrolls (`scrollRef`, named by `label`), the dock under it.
 */
export function DockedThread({
  children,
  dock,
  floating,
  label,
  scrollRef,
}: Readonly<{
  children: ReactNode;
  /** The composer; omitted while the chat loads or cannot be shown. */
  dock?: ReactNode;
  floating?: ReactNode;
  label?: string;
  scrollRef?: RefObject<HTMLElement | null>;
}>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section
        ref={scrollRef}
        aria-label={label}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-[var(--modal-padding)]"
      >
        <div className="flex min-h-full min-w-0 flex-col gap-4 py-4">{children}</div>
      </section>
      {dock ? (
        <div className="px-[var(--modal-padding)]">
          <ComposerDock floating={floating}>{dock}</ComposerDock>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The composer's dock: under the thread's scrolling region, 8 above the
 * composer and 16 under it. `floating` (a "Jump to latest" control) floats
 * centred just above the dock, over the end of the thread and out of flow,
 * so showing it never moves the composer or resizes the thread.
 */
export function ComposerDock({
  children,
  floating,
}: Readonly<{ children: ReactNode; floating?: ReactNode }>) {
  return (
    <div className="z-sticky relative shrink-0 pt-2 pb-4">
      {floating ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center pb-2">
          <div className="pointer-events-auto">{floating}</div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * The message box: one framed field with its context chips above it and its
 * tools and send control under it. The frame is the box (radius 12, the strong
 * edge, an 8 inset); the field inside is a `Textarea` with the `composer`
 * placement. Chips render only when there are any.
 */
export function ComposerFrame({
  onSubmit,
  chips,
  chipsLabel,
  field,
  tools,
  submit,
}: Readonly<{
  onSubmit: () => void;
  /** `RemovableChip`s; omitted or empty, the row is not drawn. */
  chips?: ReactNode;
  chipsLabel: string;
  field: ReactNode;
  tools?: ReactNode;
  submit: ReactNode;
}>) {
  return (
    <form
      className="bg-input border-border-bold grid gap-1 rounded-[var(--radius-card)] border p-2"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {chips ? (
        <ul aria-label={chipsLabel} className="flex flex-wrap gap-2">
          {chips}
        </ul>
      ) : null}
      {field}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">{tools}</div>
        {submit}
      </div>
    </form>
  );
}

/**
 * A reference the message will carry, as a pill in a `ComposerFrame`'s chip
 * row: its caption-sized label and, when it is optional, a control that
 * removes it.
 */
export function RemovableChip({
  label,
  onRemove,
}: Readonly<{ label: string; onRemove?: () => void }>) {
  return (
    <li className="border-border text-secondary inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-0.5">
      <span className={textRole('caption', 'truncate text-secondary')}>{label}</span>
      {onRemove ? (
        <Pressable
          className="focus-ring hover:text-foreground flex w-auto rounded-full"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <Icon icon={X} />
        </Pressable>
      ) : null}
    </li>
  );
}

export type Suggestion = Readonly<{ key: string; label: string; detail?: string }>;

/**
 * The suggestions an editable field offers while focus stays in the field (a
 * `/` skill or an `@` mention): a listbox that opens just above the field at
 * its full width, each option a label and an optional caption. The field owns
 * the keyboard (`aria-activedescendant` names `${id}-${index}`); a press picks
 * without taking focus.
 */
export function SuggestionList({
  id,
  label,
  open,
  options,
  selected,
  onPick,
}: Readonly<{
  id: string;
  label: string;
  open: boolean;
  options: readonly Suggestion[];
  selected: number;
  onPick: (index: number) => void;
}>) {
  return (
    <ul
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- The popup uses ARIA options while focus remains in the editable combobox.
      role="listbox"
      aria-label={label}
      hidden={!open}
      className={cn(menuPanelClasses, 'absolute inset-x-0 bottom-full mb-0.5 grid')}
    >
      {options.map((option, index) => (
        <li
          key={option.key}
          id={`${id}-${index}`}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- ARIA listbox options keep focus on the editable field.
          role="option"
          aria-selected={index === selected}
          data-active={index === selected}
          className={cn(menuItemVariants(), 'grid gap-0.5 py-2')}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(index);
          }}
        >
          <span className="truncate">{option.label}</span>
          {option.detail ? (
            <span className={textRole('caption', 'truncate')}>{option.detail}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
