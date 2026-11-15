import type { ReactNode } from 'react';

import { textRole } from '@/components/ui/typography';
import { Section, SectionHeader } from '@/components/ui/section';

/**
 * BillingPlan — the card that opens the Billing page: what the workspace is
 * on. Its head holds the label over the plan name and its access `badge`, the
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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className={textRole('heading', 'min-w-0 break-words')}>{name}</h2>
          {badge}
        </div>
        {detail}
      </SectionHeader>
      {children ? <div className="flex min-w-0 flex-col gap-4">{children}</div> : null}
    </Section>
  );
}
