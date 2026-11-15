import type { ReactNode } from 'react';

import { SectionHeader, SectionTitle } from '@/components/ui/section';
import { slipClasses } from '@/components/ui/slip';
import { StateHeadingLevelContext } from '@/components/ui/state-block';

/**
 * One Overview widget: a slip, because the grid's modules are unrelated
 * peers (brand 2.4), with its title, an optional link at the head's end and
 * its body. Every widget has the same floor, so loading, empty and error
 * states never resize it.
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
      className={slipClasses('flex h-full min-h-64 min-w-0 flex-col')}
    >
      <SectionHeader actions={actions}>
        {eyebrow}
        <SectionTitle id={id}>{title}</SectionTitle>
        {description}
      </SectionHeader>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
      </div>
    </section>
  );
}
