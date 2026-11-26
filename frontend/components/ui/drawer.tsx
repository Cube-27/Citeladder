import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode, RefObject } from 'react';

import { CLOSE_BUTTON, IconButton } from '@/components/ui/button';
import { SCRIM, useReturnFocus } from '@/components/ui/dialog';
import { X } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { SurfaceContext } from '@/components/ui/section';
import { SHEET_FACE } from '@/components/ui/slip';

const DRAWER_PANE =
  'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-[var(--panel-inset)] overflow-x-hidden overflow-y-auto overscroll-contain p-[var(--panel-inset)]';

export const DRAWER_SPLIT =
  'phone:grid-cols-1 phone:grid-rows-[auto_minmax(0,1fr)] grid min-h-0 flex-1 grid-cols-[11.5rem_minmax(0,1fr)]';

export function DrawerNav({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="border-rule phone:border-e-0 phone:border-b border-e px-3 py-[var(--panel-inset)]">
      {children}
    </div>
  );
}

export function DrawerPane({
  children,
  label,
  scrollRef,
}: Readonly<{ children: ReactNode; label?: string; scrollRef?: RefObject<HTMLElement | null> }>) {
  return (
    <section ref={scrollRef} aria-label={label} className={DRAWER_PANE}>
      {children}
    </section>
  );
}

const DRAWER_WIDTH = {
  narrow: 'max-w-narrow',
  wide: 'max-w-form',
  split: 'max-w-prose',
  rail: 'max-w-220',
} as const;

export function Drawer({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  actions,
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
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  body?: 'scroll' | 'dock';
  closeLabel?: string;
  side?: 'left' | 'right';
  hideHeader?: boolean;
  width?: keyof typeof DRAWER_WIDTH;
}>) {
  const returnFocus = useReturnFocus(open);
  const close = (
    <DialogPrimitive.Close asChild>
      <IconButton
        icon={X}
        label={closeLabel}
        tooltip={false}
        variant="secondary"
        className={cn(CLOSE_BUTTON, hideHeader ? 'absolute top-4 right-4 z-1' : 'shrink-0')}
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
          data-overlay=""
          data-side={side}
          className={cn(
            SHEET_FACE,
            'drawer-panel z-modal fixed inset-y-2 flex w-[calc(100vw-1rem)] flex-col overflow-hidden',
            side === 'left' ? 'left-2 max-w-68' : 'right-2',
            side === 'right' && DRAWER_WIDTH[width],
          )}
        >
          <DrawerHeader
            title={title}
            eyebrow={eyebrow}
            description={description}
            actions={actions}
            hidden={hideHeader}
            close={close}
          />
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col [--panel-inset:var(--modal-padding)]',
              body === 'dock' ? 'overflow-hidden' : DRAWER_PANE,
            )}
          >
            <SurfaceContext value="surface">{children}</SurfaceContext>
          </div>
          {footer ? (
            <footer className="border-rule flex items-center justify-end gap-2 border-t px-[var(--modal-padding)] py-3">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DrawerHeader({
  title,
  eyebrow,
  description,
  actions,
  hidden,
  close,
}: Readonly<{
  title: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
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
    <header className="flex items-start justify-between gap-4 px-[var(--modal-padding)] pt-[var(--modal-padding)]">
      <div className="min-w-0">
        {eyebrow ? <p className="type-caption-strong mb-1">{eyebrow}</p> : null}
        <DialogPrimitive.Title className="type-heading truncate">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description asChild>
            <div className="text-body text-ink-2 mt-1">{description}</div>
          </DialogPrimitive.Description>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {close}
      </div>
    </header>
  );
}
