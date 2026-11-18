import type { ReactNode } from 'react';

import { POP_FACE } from '@/components/ui/slip';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * What is selected and what can be done to it, in a bar held over the bottom
 * of the column: the dock takes no height in the page, so a selection
 * appearing or clearing moves nothing.
 */
export function SelectionDock({
  label,
  summary,
  children,
}: Readonly<{
  label: string;
  /** "N selected"; the bar shows only while there is one. */
  summary: string | null;
  children: ReactNode;
}>) {
  return (
    <DockLayer>
      {summary === null ? null : (
        <DockBar label={label} slidesIn>
          <span className={textRole('body', 'px-2 whitespace-nowrap tabular-nums')}>{summary}</span>
          {children}
        </DockBar>
      )}
    </DockLayer>
  );
}

/**
 * A page dock's fixed slots from `rail` up, so a status change swaps labels and
 * nothing in the dock moves; below it the dock fits the screen and the
 * primary's label cuts.
 */
export const DOCK_SLOT = {
  // Every decision label (Decline, Accept, Restore) is under 112px, so the minimum holds it fixed.
  decision: 'min-w-28',
  wide: 'rail:w-44',
  primary: 'min-w-0 shrink truncate rail:w-64',
} as const;

/** A record page's decisions in the same held bar, always shown and always the same size. */
export function PageDock({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <DockLayer>
      <DockBar label={label}>{children}</DockBar>
    </DockLayer>
  );
}

function DockLayer({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="pointer-events-none sticky bottom-5 z-10 h-0">{children}</div>;
}

/** `slidesIn`: a selection's bar slides up as it appears (ui-motion.css). */
function DockBar({
  label,
  slidesIn,
  children,
}: Readonly<{ label: string; slidesIn?: boolean; children: ReactNode }>) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-selection-dock={slidesIn ? '' : undefined}
      className={cn(
        POP_FACE,
        'pointer-events-auto absolute bottom-0 left-1/2 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 p-2',
      )}
    >
      {children}
    </div>
  );
}
