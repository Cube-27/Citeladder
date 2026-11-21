import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { PageFrame, type PageFrameSlots } from './page-frame';

/**
 * The Settings layout (docs/design.md): the page header and tab strip, then
 * the route's column holding a stack of `SettingsGroup`s 32 apart, each tab
 * panel stacking its own the same way (globals.css, `data-settings-sections`).
 */
export function SettingsPage({
  children,
  prose = false,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'trail' | 'crumb'> &
  Readonly<{
    /**
     * The content keeps the 720 column on the 1040 column's left edge, so a
     * page whose one wide tab sets its route to 1040 never moves its header
     * and tabs between tabs (AR-9).
     */
    prose?: boolean;
    children: ReactNode;
  }>) {
  return (
    <PageFrame {...slots}>
      <div
        data-settings-sections=""
        className={cn('min-w-0', prose && 'max-w-[var(--container-prose)]')}
      >
        {children}
      </div>
    </PageFrame>
  );
}
