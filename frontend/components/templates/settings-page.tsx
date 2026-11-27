import type { ReactNode } from 'react';

import { SectionStack } from '@/components/ui/section';

import { RailColumns } from '@/components/ui/page-chrome';

import { PageFrame, type PageFrameSlots } from './page-frame';

export function SettingsPage({
  children,
  rail,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'trail' | 'crumb' | 'tabs'> &
  Readonly<{
    rail?: ReactNode;
    children: ReactNode;
  }>) {
  const sections = <SectionStack>{children}</SectionStack>;
  return (
    <PageFrame {...slots}>
      {rail ? <RailColumns rail={rail}>{sections}</RailColumns> : sections}
    </PageFrame>
  );
}
