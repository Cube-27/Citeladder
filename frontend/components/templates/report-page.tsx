import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/**
 * Report (brand direction 3.4): masthead, page tabs, filter bar, then the
 * sections (figure strip, chart, tables), 32 apart. Overview, AI Visibility,
 * Shopping, Performance, AI Traffic, Keyword Research, Website's report tabs
 * and a prompt.
 */
export function ReportPage({
  children,
  ...slots
}: PageFrameSlots & Readonly<{ children: ReactNode }>) {
  return (
    <PageFrame {...slots}>
      <PageSections>{children}</PageSections>
    </PageFrame>
  );
}
