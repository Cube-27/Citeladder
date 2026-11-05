import type { ReactNode } from 'react';

import { cardClasses } from '@/components/ui/card';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * BillingPlan — the card that opens the Billing page: what the workspace is
 * on. Its label over the plan name (the `figure` role) and its access
 * `badge`, the subscription `detail` under them, and one `action` at the
 * right; `children` are the plan's notices, under the summary.
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
    <section aria-label={label} className={cn(cardClasses(), 'flex min-w-0 flex-col gap-4')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={textRole('label')}>{label}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className={textRole('figure', 'min-w-0 truncate')} title={name}>
              {name}
            </p>
            {badge}
          </div>
          {detail}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
