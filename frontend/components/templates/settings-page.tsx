import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/**
 * Settings: the masthead, page tabs, then one card per group across the full
 * main column. Each card's head sits on top and its body below at full card
 * width, every field column capped at 640 (globals.css). A table, and any
 * child marked `data-settings-wide` (usage meters, a plan grid), takes the
 * card's full width.
 */
export function SettingsPage({
  children,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'back'> & Readonly<{ children: ReactNode }>) {
  return (
    <PageFrame {...slots}>
      <div data-settings-sections="" className="min-w-0">
        <PageSections>{children}</PageSections>
      </div>
    </PageFrame>
  );
}
