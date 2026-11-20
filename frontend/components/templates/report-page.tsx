import type { ReactNode } from 'react';

import { PageFrame, PageSections, type PageFrameSlots } from './page-frame';

/**
 * Report: page header, tab strip, toolbar strip, then the
 * sections (figure strip, chart, tables), 24 apart. Overview, AI Visibility,
 * Shopping, Performance, AI Traffic, Keyword Research, Website's report tabs,
 * a prompt and collections (one table or grid of slips).
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
