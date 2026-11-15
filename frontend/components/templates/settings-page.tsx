import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/**
 * Settings: the masthead, page tabs, then sections of label-and-control
 * rows. Below a 1100px main column each section's head stacks over a 640px
 * column; from 1100 the head and caption take the first four grid columns and
 * the rows the next eight, so the width is used (globals.css).
 */
export function SettingsPage({
  children,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'back'> & Readonly<{ children: ReactNode }>) {
  return (
    <PageFrame {...slots}>
      <div data-settings-sections="" className="min-w-0">
        <PageSections className="max-w-form column-history:max-w-none w-full">
          {children}
        </PageSections>
      </div>
    </PageFrame>
  );
}
