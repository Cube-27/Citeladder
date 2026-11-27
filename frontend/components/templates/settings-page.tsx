import type { ReactNode } from 'react';

import { SectionStack } from '@/components/ui/section';

import { RailColumns, type RailSection } from '@/components/ui/page-chrome';

import { PageFrame, type PageFrameSlots } from './page-frame';

export function SettingsPage({
  children,
  rail,
  ...slots
}: Omit<PageFrameSlots, 'filters' | 'trail' | 'crumb' | 'tabs'> &
  Readonly<{
    rail?: Readonly<{ nav: ReactNode; section: RailSection }>;
    children: ReactNode;
  }>) {
  const sections = <SectionStack>{children}</SectionStack>;
  return (
    <PageFrame {...slots}>
      {rail ? (
        <RailColumns rail={rail.nav} section={rail.section}>
          {sections}
        </RailColumns>
      ) : (
        sections
      )}
    </PageFrame>
  );
}
