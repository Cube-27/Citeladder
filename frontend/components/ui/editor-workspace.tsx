import type { ReactNode, RefObject } from 'react';

import { cn } from '@/lib/utils';
import { SLIP_FACE } from '@/components/ui/slip';

const FILL = 'h-[calc(100dvh-var(--route-chrome-height))] min-h-0';
const COLUMN = cn('surface-card', SLIP_FACE, 'flex min-h-0 min-w-0 flex-col overflow-hidden');

export const EDITOR_RAIL_TAB = 'flex min-h-0 flex-1 flex-col';

export function EditorWorkspace({ page, rail }: Readonly<{ page: ReactNode; rail: ReactNode }>) {
  return (
    <div
      data-editor-workspace="wide"
      className={cn(
        FILL,
        'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-[var(--workspace-gap)]',
      )}
    >
      {page}
      {rail}
    </div>
  );
}

export function EditorStack({
  tabs,
  children,
}: Readonly<{ tabs: ReactNode; children: ReactNode }>) {
  return (
    <div
      data-editor-workspace="narrow"
      className={cn(FILL, 'flex flex-col gap-[var(--page-band-gap)]')}
    >
      {tabs}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function EditorPane({
  label,
  head,
  children,
}: Readonly<{ label: string; head?: ReactNode; children: ReactNode }>) {
  return (
    <section aria-label={label} className={cn(COLUMN, 'flex-1')}>
      {head ? (
        <div className="border-rule grid gap-2 border-b px-[var(--card-padding)] py-3">{head}</div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </section>
  );
}

export function EditorRail({
  head,
  children,
  foot,
}: Readonly<{ head?: ReactNode; children: ReactNode; foot?: ReactNode }>) {
  return (
    <div className={cn(COLUMN, 'flex-1')}>
      {head ? (
        <div className="px-[var(--card-padding)] pt-[var(--card-padding)]">{head}</div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {foot ? (
        <div className="border-rule max-h-[60%] shrink-0 overflow-y-auto border-t p-[var(--compact-gap)]">
          {foot}
        </div>
      ) : null}
    </div>
  );
}

export function EditorRailPanel({
  label,
  scrollRef,
  padding = 'card',
  children,
}: Readonly<{
  label?: string;
  scrollRef?: RefObject<HTMLElement | null>;
  padding?: 'card' | 'thread';
  children: ReactNode;
}>) {
  return (
    <section
      ref={scrollRef}
      aria-label={label}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div
        className={cn(
          'flex min-w-0 flex-col gap-[var(--workspace-gap)]',
          padding === 'card' ? 'p-[var(--card-padding)]' : 'py-[var(--compact-gap)]',
        )}
      >
        {children}
      </div>
    </section>
  );
}
