import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/**
 * Settings: the page header, tab strip, then one section per group in the
 * route's compact column, a rule between groups. A group's head sits on top
 * and its rows (`SettingRow`) below; only a form field stops at 640 (globals.css).
 */
export function SettingsPage({
  children,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'trail' | 'crumb'> & Readonly<{ children: ReactNode }>) {
  return (
    <PageFrame {...slots}>
      <div data-settings-sections="" className="min-w-0">
        <PageSections>{children}</PageSections>
      </div>
    </PageFrame>
  );
}
