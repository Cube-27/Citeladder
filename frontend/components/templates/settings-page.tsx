import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/**
 * Settings: the masthead, page tabs, then one card per group across the full
 * main column. From a 900px card each card is two columns, its head and
 * caption on the left third and its label-and-control rows on the right
 * (controls up to 640); below that the head stacks over the rows
 * (globals.css). A table, and any child marked `data-settings-wide` (usage
 * meters, a plan grid), takes the card's full width at every size.
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
