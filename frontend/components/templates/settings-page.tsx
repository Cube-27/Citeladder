import type { ReactNode } from 'react';

import { PageFrame, type PageFrameSlots } from './page-frame';

/**
 * The Settings layout (docs/design.md): the page header and tab strip, then
 * the route's column holding a stack of `SettingsGroup`s 32 apart, each tab
 * panel stacking its own the same way (globals.css, `data-settings-sections`).
 */
export function SettingsPage({
  children,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'trail' | 'crumb'> & Readonly<{ children: ReactNode }>) {
  return (
    <PageFrame {...slots}>
      <div data-settings-sections="" className="min-w-0">
        {children}
      </div>
    </PageFrame>
  );
}
