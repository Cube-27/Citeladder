import type { ReactNode } from 'react';

import { textRole } from '@/components/ui/typography';
import { Section } from '@/components/ui/section';

/**
 * BillingPlan — the section that opens the Billing page: what the workspace
 * is on. Its overline label over the plan name and its access `badge`, the
 * subscription `detail` under them, and one `action` at the right;
 * `children` are the plan's notices and offers, under the summary.
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
    <Section aria-label={label} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="type-overline">{label}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className={textRole('heading', 'min-w-0 break-words')}>{name}</h2>
            {badge}
          </div>
          {detail}
        </div>
        {action ? (
          <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>
        ) : null}
      </div>
      {children}
    </Section>
  );
}
