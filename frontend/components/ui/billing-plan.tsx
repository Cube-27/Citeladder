import type { ReactNode } from 'react';

import { textRole } from '@/components/ui/typography';
import { Section, SectionHeader, SectionTitleLine } from '@/components/ui/section';

/**
 * BillingPlan — the card that opens the Billing page: what the workspace is
 * on, named by `label`. Its head holds the plan name and its access `badge`, the
 * subscription `detail` under them, and one `action` at the right;
 * `children` are the plan's notices and offers, under the head.
 */
export function BillingPlan({
  label,
  name,
  badge,
  detail,
  action,
  children,
}: Readonly<{
  label: string;
  name: string;
  badge?: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <Section aria-label={label}>
      <SectionHeader actions={action}>
        <SectionTitleLine>
          <h2 className={textRole('heading', 'min-w-0 break-words')}>{name}</h2>
          {badge}
        </SectionTitleLine>
        {detail}
      </SectionHeader>
      {children ? <div className="flex min-w-0 flex-col gap-4">{children}</div> : null}
    </Section>
  );
}
