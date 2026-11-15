import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/**
 * Settings (brand direction 3.4): the masthead, page tabs, then one 640px
 * column of sections, each a set of label-and-control rows.
 */
export function SettingsPage({
  children,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'back'> & Readonly<{ children: ReactNode }>) {
  return (
    <PageFrame {...slots}>
      <PageSections className="max-w-form w-full">{children}</PageSections>
    </PageFrame>
  );
}
