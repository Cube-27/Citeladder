import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { useInsertionEffect, useRef, type ReactNode, type RefObject } from 'react';

import { cn } from '@/lib/utils';
import { Button, IconButton } from './button';
import { Icon } from './icon';
import { SHEET_FACE } from '@/components/ui/slip';

/** Every modal sheet's one scrim (dialog, drawer, command palette, navigation drawer). */
export const SCRIM = 'bg-scrim z-overlay fixed inset-0';

/**
 * The element that opened an overlay. An item of a menu closes with its menu,
 * so the menu's trigger stands in for it.
 */
function opener(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  if (active === document.documentElement || !active.isConnected) return null;
  const menu = active.closest('[role="menu"]');
  const triggerId = menu?.getAttribute('aria-labelledby');
  const trigger = triggerId ? document.getElementById(triggerId) : null;
  return trigger ?? active;
}

const shown = (node: HTMLElement) =>
  typeof node.checkVisibility === 'function' ? node.checkVisibility() : true;

/**
 * Where focus goes back to: the opener while it shows, else the visible
 * control that expands the region hiding it (the masthead's More actions
 * button for an action folded into its panel).
 */
function returnTargetFor(node: HTMLElement): HTMLElement | null {
  if (!node.isConnected) return null;
  if (shown(node)) return node;
  for (let region = node.parentElement; region; region = region.parentElement) {
    if (!region.id) continue;
    const controls = document.querySelectorAll<HTMLElement>(`[aria-controls="${region.id}"]`);
    const control = [...controls].find(shown);
    if (control) return control;
  }
  return null;
}

/**
 * Remembers the element that opened an overlay, so closing returns focus to
 * it even when Radix's own trigger is not the opener: a menu item's menu
 * trigger, or the More actions button when the opener was folded away.
 */
export function useReturnFocus(open: boolean) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  useInsertionEffect(() => {
    if (open && !wasOpenRef.current) returnFocusRef.current = opener(document.activeElement);
    wasOpenRef.current = open;
  }, [open]);
  return (event: Event) => {
    const recorded = returnFocusRef.current;
    returnFocusRef.current = null;
    const returnTarget = recorded ? returnTargetFor(recorded) : null;
    if (!returnTarget) return;
    event.preventDefault();
    returnTarget.focus();
  };
}

function DialogHeader({
  title,
  description,
  danger,
  divided,
}: Readonly<{ title: ReactNode; description?: ReactNode; danger: boolean; divided: boolean }>) {
  return (
    <header
      className={cn(
        'flex items-start gap-3 p-[var(--card-padding)]',
        !danger && 'pe-14',
        divided && 'border-rule border-b',
      )}
    >
      {danger ? (
        <span className="text-negative inline-flex h-7 items-center">
          <Icon icon={AlertTriangle} className="my-0" />
        </span>
      ) : null}
      <div className="min-w-0">
        <DialogPrimitive.Title className="type-heading">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description asChild>
            <div className="text-body-sm text-ink-2 mt-1">{description}</div>
          </DialogPrimitive.Description>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Dialog — a modal panel for one short task, centred across the scrim with its
 * top edge fixed at 12vh, so content that changes inside it (a tab, a picked
 * file) grows or shrinks it downward and nothing above moves: the sheet face
 * (`raised`, hairline edge, `shadow-sheet`), 16 padding and gaps, 480 wide
 * (640 `wide`; the overlay widths are 480, 560 and 640).
 * The title is the section title (500, 22/28), the description
 * `ink-2`, the footer right-aligned (Cancel first, then the action).
 * Header, body and footer are divided by hairlines. `tone="danger"` is a
 * confirmation: an `alertdialog`, 480px, a `negative` warning icon by the
 * title and no close button, so the person picks Cancel or the named action.
 * Focus opens on the first tabbable element unless `initialFocusRef` is set,
 * and returns to the opener on close.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  tone = 'default',
  width = 'narrow',
  initialFocusRef,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'danger';
  /**
   * `wide` (640px) only for a side-by-side review the narrow panel cannot
   * hold (two calendar months, a CSV preview); a long form is a Drawer.
   */
  width?: 'narrow' | 'wide';
  initialFocusRef?: RefObject<HTMLElement | null>;
}>) {
  const returnFocus = useReturnFocus(open);
  const danger = tone === 'danger';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn('dialog-overlay', SCRIM)} />
        <DialogPrimitive.Content
          role={danger ? 'alertdialog' : 'dialog'}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(event) => {
            if (!initialFocusRef?.current) return;
            event.preventDefault();
            initialFocusRef.current.focus();
          }}
          onCloseAutoFocus={returnFocus}
          className={cn(
            SHEET_FACE,
            'dialog-panel z-modal fixed top-[12vh] left-1/2 flex max-h-[calc(88dvh-1.5rem)] w-[calc(100vw-3rem)] -translate-x-1/2 flex-col overflow-hidden rounded-sheet',
            !danger && width === 'wide' ? 'max-w-form' : 'max-w-flow',
          )}
        >
          <DialogHeader
            title={title}
            description={description}
            danger={danger}
            divided={children != null}
          />
          {danger ? null : (
            <DialogPrimitive.Close asChild>
              <IconButton
                icon={X}
                label="Close dialog"
                tooltip={false}
                className="absolute top-4 right-4"
              />
            </DialogPrimitive.Close>
          )}
          {children == null ? null : (
            <div className="text-ink flex min-h-0 flex-1 flex-col gap-4 overflow-auto overscroll-contain p-[var(--card-padding)]">
              {children}
            </div>
          )}
          {footer ? (
            <footer className="border-rule flex items-center justify-end gap-2 border-t px-[var(--card-padding)] py-3">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export type ConfirmRequest = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

/**
 * Ask before an action that is hard to undo. Closed while `request` is null;
 * the confirm button names exactly what will happen ("Stop tracking", never
 * "OK"), and Cancel stays the safe default.
 */
export function ConfirmDialog({
  request,
  onCancel,
  pending = false,
}: Readonly<{
  request: ConfirmRequest | null;
  onCancel: () => void;
  pending?: boolean;
}>) {
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
      tone={request?.destructive ? 'danger' : 'default'}
      title={request?.title ?? ''}
      description={request?.body}
      footer={
        <>
          <Button onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={request?.destructive ? 'danger' : 'primary'}
            onClick={request?.onConfirm}
            disabled={pending}
            pending={pending}
          >
            {request?.confirmLabel}
          </Button>
        </>
      }
    />
  );
}
