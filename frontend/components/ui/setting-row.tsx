import type { ReactNode } from 'react';

import { textRole } from '@/components/ui/typography';

/**
 * One settings row (owner, 2026-11-19): at the left its name in `label` and,
 * under it, its description or current value in `ink-2`; at the right, on the
 * same row, its action (a button, a select). A row's own form or notice goes
 * in `children`, under the text. A group is a `Section` of rows 16 apart, the
 * page's section rule between groups.
 */
export function SettingRow({
  label,
  description,
  action,
  children,
}: Readonly<{
  label: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <div data-setting-row="" className="grid min-w-0 gap-[var(--compact-gap)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="grid min-w-0 flex-1 basis-60 gap-1">
          <div className={textRole('label')}>{label}</div>
          {description ? (
            <div className={textRole('body', 'text-ink-2 min-w-0 break-words')}>{description}</div>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}
