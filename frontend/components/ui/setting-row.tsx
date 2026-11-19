import type { ReactNode } from 'react';

import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * One settings row (owner, 2026-11-19): at the left its name in `label` and,
 * under it, its description or current value in `ink-2`; at the right, on the
 * same row, its action (a button, a select). A row's own form or notice goes
 * in `children`, under the text. A group is a `Section` of rows 16 apart, the
 * page's section rule between groups. A `field` row is a form field laid out
 * the same way: its control in one 320 column, so a form's controls line up
 * and a checkbox group wraps inside it, on the label's first line.
 */
export function SettingRow({
  label,
  description,
  action,
  variant = 'setting',
  children,
}: Readonly<{
  label: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  variant?: 'setting' | 'field';
  children?: ReactNode;
}>) {
  const field = variant === 'field';
  return (
    <div data-setting-row="" className="grid min-w-0 gap-[var(--compact-gap)]">
      <div
        className={cn(
          'flex min-w-0 flex-wrap justify-between gap-x-6 gap-y-2',
          field ? 'items-baseline' : 'items-center',
        )}
      >
        <div className="grid min-w-0 flex-1 basis-60 gap-1">
          <div className={textRole('label')}>{label}</div>
          {description === undefined || description === null ? null : (
            <div className={textRole('body', 'text-ink-2 min-w-0 break-words')}>{description}</div>
          )}
        </div>
        {action ? (
          <div
            className={cn(
              'flex shrink-0 flex-wrap items-center gap-2',
              field && 'w-80 max-w-full *:w-full',
            )}
          >
            {action}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
