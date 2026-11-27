import type { ReactNode, RefObject } from 'react';

import { cn } from '@/lib/utils';
import { PanelFrame, SurfaceContext } from '@/components/ui/section';

const FILL = 'h-[calc(100dvh-var(--route-chrome-height))] min-h-0';

export function EditorWorkspace({ page, rail }: Readonly<{ page: ReactNode; rail: ReactNode }>) {
  return (
    <div
      data-editor-workspace="wide"
      className={cn(FILL, 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-workspace')}
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
    <div data-editor-workspace="narrow" className={cn(FILL, 'flex flex-col gap-band')}>
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
    <PanelFrame as="section" aria-label={label}>
      {head ? <div className="border-rule px-card grid gap-2 border-b py-3">{head}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </PanelFrame>
  );
}

export function EditorRail({
  head,
  children,
  foot,
}: Readonly<{ head?: ReactNode; children: ReactNode; foot?: ReactNode }>) {
  return (
    <PanelFrame>
      {head ? <div className="px-card pt-card">{head}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {foot ? <div className="border-rule p-compact shrink-0 border-t">{foot}</div> : null}
    </PanelFrame>
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
          'flex min-w-0 flex-col',
          padding === 'card'
            ? 'gap-panel-inset p-panel-inset [--spacing-panel-inset:var(--spacing-card)]'
            : 'gap-workspace py-compact',
        )}
      >
        <SurfaceContext value="surface">{children}</SurfaceContext>
      </div>
    </section>
  );
}
