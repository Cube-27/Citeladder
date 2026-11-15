import type { ReactNode } from 'react';

import { Stack } from '@/components/ui/layout';
import { SectionHeader, SectionTitle } from '@/components/ui/section';
import { slipClasses } from '@/components/ui/slip';
import { StateHeadingLevelContext } from '@/components/ui/state-block';

/**
 * One Overview widget: a slip, because the grid's modules are unrelated
 * peers (brand 2.4), with its title, an optional link at the head's end and
 * its body. Side by side, every widget has the same floor, so loading, empty
 * and error states never resize a row.
 */
export function WidgetFrame({
  id,
  title,
  eyebrow,
  description,
  actions,
  children,
}: Readonly<{
  /** The heading's id, which names the region. */
  id: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section
      aria-labelledby={id}
      data-overview-widget=""
      className={slipClasses('column-wide:min-h-64 flex h-full min-w-0 flex-col')}
    >
      <SectionHeader actions={actions}>
        {eyebrow}
        <SectionTitle id={id}>{title}</SectionTitle>
        {description}
      </SectionHeader>
      <Stack gap="compact" className="min-w-0 flex-1 content-start">
        <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
      </Stack>
    </section>
  );
}
