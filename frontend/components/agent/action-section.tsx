import type { ReactNode } from 'react';

import { Stack } from '@/components/ui/layout';
import { Section, SectionContent, SectionHeader, SectionTitle } from '@/components/ui/section';
import { textRole } from '@/components/ui/typography';

/**
 * One section of an Action's record: a card with its h2 (and an optional
 * caption under it) and actions, then its body.
 */
export function ActionSection({
  title,
  id,
  caption,
  actions,
  children,
}: Readonly<{
  title: string;
  id: string;
  caption?: string | null;
  actions?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <Section aria-labelledby={id}>
      <SectionHeader actions={actions}>
        <div className="grid min-w-0 gap-1">
          <SectionTitle id={id} level={2}>
            {title}
          </SectionTitle>
          {caption ? <p className={textRole('caption', 'text-ink-2')}>{caption}</p> : null}
        </div>
      </SectionHeader>
      <SectionContent>
        <Stack gap="workspace" className="min-w-0">
          {children}
        </Stack>
      </SectionContent>
    </Section>
  );
}
