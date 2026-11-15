import type { ReactNode } from 'react';

import { Stack } from '@/components/ui/layout';
import { Section, SectionContent, SectionHeader, SectionTitle } from '@/components/ui/section';

/** One section of an Action's record: the ink rule, its h2 and actions, then its body. */
export function ActionSection({
  title,
  id,
  actions,
  children,
}: Readonly<{ title: string; id: string; actions?: ReactNode; children: ReactNode }>) {
  return (
    <Section aria-labelledby={id}>
      <SectionHeader actions={actions}>
        <SectionTitle id={id} level={2}>
          {title}
        </SectionTitle>
      </SectionHeader>
      <SectionContent>
        <Stack gap="workspace" className="min-w-0">
          {children}
        </Stack>
      </SectionContent>
    </Section>
  );
}
