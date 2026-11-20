import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconButton } from '@/components/ui/button';
import { SCRIM, useReturnFocus } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SHEET_FACE } from '@/components/ui/slip';

/**
 * Drawer — a sheet for editing or inspecting one item without leaving the
 * list behind it. It floats 8px from the viewport edges, 560 wide (640
 * `wide`), with the sheet face (`raised`, 1px `rule` edge, radius 12, `shadow-sheet`)
 * on the scrim. The header (eyebrow,
 * the section title at 500, 22/28, description) and the footer are fixed behind 1px
 * `line` rules; only the body scrolls, with `modal-padding` and 16px between
 * blocks. `footer` holds the actions on the right.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  children,
  footer,
  body = 'scroll',
  closeLabel = 'Close drawer',
  side = 'right',
  hideHeader = false,
  width = 'narrow',
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `scroll`: the body scrolls as one padded column. `dock`: the body is a
   * docked thread — its thread scrolls in its own padded region and a
   * composer docks under it, so the body itself neither scrolls nor pads.
   */
  body?: 'scroll' | 'dock';
  closeLabel?: string;
  /** `left` is the app's navigation sheet on a narrow screen. */
  side?: 'left' | 'right';
  /** Keeps the accessible title but removes the visible header. */
  hideHeader?: boolean;
  /**
   * `narrow` (default, 560) for one item's fields; `wide` (640) for evidence
   * that sets an answer beside its sources. The `left` navigation sheet is
   * always 272px.
   */
  width?: 'narrow' | 'wide';
}>) {
  const returnFocus = useReturnFocus(open);
  const close = (
    <DialogPrimitive.Close asChild>
      <IconButton
        icon={X}
        label={closeLabel}
        tooltip={false}
        className={hideHeader ? 'absolute top-3 right-3 z-1' : '-me-2 shrink-0'}
      />
    </DialogPrimitive.Close>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn('drawer-overlay', SCRIM)} />
        <DialogPrimitive.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          onCloseAutoFocus={returnFocus}
          data-side={side}
          className={cn(
            SHEET_FACE,
            'drawer-panel z-modal fixed inset-y-2 flex w-[calc(100vw-1rem)] flex-col overflow-hidden',
            side === 'left' ? 'left-2 max-w-68' : 'right-2',
            side === 'right' && (width === 'wide' ? 'max-w-form' : 'max-w-narrow'),
          )}
        >
          <DrawerHeader
            title={title}
            eyebrow={eyebrow}
            description={description}
            hidden={hideHeader}
            close={close}
          />
          <div
            className={cn(
              'min-h-0 flex-1',
              body === 'dock'
                ? 'flex flex-col overflow-hidden'
                : 'flex flex-col gap-[var(--workspace-gap)] overflow-x-hidden overflow-y-auto overscroll-contain p-[var(--card-padding)]',
            )}
          >
            {children}
          </div>
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

/**
 * The fixed header: eyebrow, title, description and the close button. When
 * `hidden`, the title and description stay for assistive technology only.
 */
function DrawerHeader({
  title,
  eyebrow,
  description,
  hidden,
  close,
}: Readonly<{
  title: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  hidden: boolean;
  close: ReactNode;
}>) {
  if (hidden) {
    return (
      <>
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        {close}
      </>
    );
  }
  return (
    <header className="border-rule flex items-start justify-between gap-4 border-b px-[var(--card-padding)] py-4">
      <div className="min-w-0">
        {eyebrow ? <p className="type-caption-strong mb-1">{eyebrow}</p> : null}
        <DialogPrimitive.Title className="type-heading truncate">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description asChild>
            <div className="text-body-sm text-ink-2 mt-1">{description}</div>
          </DialogPrimitive.Description>
        ) : null}
      </div>
      {close}
    </header>
  );
}
