import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/**
 * Settings: the masthead, page tabs, then one card per group across the full
 * main column. Each card's head sits on top and its body below at full card
 * width; only a form field stops at 640 (globals.css).
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
