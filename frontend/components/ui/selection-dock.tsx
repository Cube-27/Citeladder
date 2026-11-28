import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { POP_FACE } from '@/components/ui/slip';

import { cn } from '@/lib/utils';

export function SelectionDock({
  label,
  summary,
  children,
}: Readonly<{
  label: string;
  summary: string | null;
  children: ReactNode;
}>) {
  return (
    <DockLayer>
      {summary === null ? null : (
        <DockBar label={label} slidesIn>
          <span className="text-body text-ink px-2 whitespace-nowrap tabular-nums">{summary}</span>
          {children}
        </DockBar>
      )}
    </DockLayer>
  );
}

export function DockLabel({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="min-w-0 truncate">{children}</span>;
}

export function PageDock({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <DockLayer>
      <DockBar label={label}>{children}</DockBar>
    </DockLayer>
  );
}

function DockLayer({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="z-raised pointer-events-none sticky bottom-5 h-0">{children}</div>;
}

function DockBar({
  label,
  slidesIn,
  children,
}: Readonly<{ label: string; slidesIn?: boolean; children: ReactNode }>) {
  return (
    <FloatingBar
      place="overlay"
      role="toolbar"
      aria-label={label}
      data-selection-dock={slidesIn ? '' : undefined}
    >
      {children}
    </FloatingBar>
  );
}

const BAR_PLACE = {
  overlay: 'max-w-viewport-fit pointer-events-auto absolute bottom-0 left-1/2 -translate-x-1/2',
  sticky: 'mt-workspace mx-auto max-w-full z-sticky bottom-gutter sticky',
  flow: 'mt-workspace mx-auto max-w-full shrink-0 flex-wrap justify-center',
} as const;

export function FloatingBar({
  place,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'style'> & {
    place: keyof typeof BAR_PLACE;
    'data-page-band'?: string;
    'data-selection-dock'?: string;
  }
>) {
  return (
    <div
      {...props}
      className={cn(POP_FACE, 'flex w-fit min-w-0 items-center gap-1 p-2', BAR_PLACE[place])}
    >
      {children}
    </div>
  );
}
