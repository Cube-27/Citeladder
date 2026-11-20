import type { ReactNode } from 'react';

import { PageFrame, type PageFrameSlots } from './page-frame';

/**
 * The Settings layout (docs/design.md): the page header and tab strip, then
 * the route's column holding a stack of `SettingsGroup`s 32 apart, each tab
 * panel stacking its own the same way (globals.css, `data-settings-sections`).
 */
export function SettingsPage({
  children,
  wide = false,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'trail' | 'crumb'> &
  Readonly<{
    /** This view takes the 1040 column instead of the route's 720 (AR-9). */
    wide?: boolean;
    children: ReactNode;
  }>) {
  return (
    <PageFrame {...slots} width={wide ? 'narrow' : undefined}>
      <div data-settings-sections="" className="min-w-0">
        {children}
      </div>
    </PageFrame>
  );
}
