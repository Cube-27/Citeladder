import { Slot } from '@radix-ui/react-slot';
import type { ReactElement, ReactNode } from 'react';

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

const DOCK_SLOT = {
  decision: 'min-w-28',
  wide: 'rail:w-44',
  primary: 'min-w-0 shrink rail:w-64',
} as const;

export function DockSlot({
  size,
  children,
}: Readonly<{ size: keyof typeof DOCK_SLOT; children?: ReactElement }>) {
  if (!children) return <span aria-hidden className={cn(DOCK_SLOT[size], 'shrink-0')} />;
  return <Slot className={DOCK_SLOT[size]}>{children}</Slot>;
}

export function DockLabel({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="min-w-0 truncate">{children}</span>;
}

export function PageDock({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <DockLayer>
      <DockBar label={label} span>
        {children}
      </DockBar>
    </DockLayer>
  );
}

function DockLayer({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="z-raised pointer-events-none sticky bottom-5 h-0">{children}</div>;
}

function DockBar({
  label,
  slidesIn,
  span = false,
  children,
}: Readonly<{ label: string; slidesIn?: boolean; span?: boolean; children: ReactNode }>) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-selection-dock={slidesIn ? '' : undefined}
      className={cn(
        POP_FACE,
        'pointer-events-auto absolute bottom-0 flex items-center gap-1 p-2',
        span ? 'inset-x-0 justify-end' : 'max-w-viewport-fit left-1/2 -translate-x-1/2',
      )}
    >
      {children}
    </div>
  );
}
