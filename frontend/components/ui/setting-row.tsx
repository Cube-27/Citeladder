import { useId, type ReactNode } from 'react';

import { FieldFoot, type ControlProps } from '@/components/ui/field';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * A list of setting rows (owner, 2026-11-19, after a reference account
 * page): 12 above and below each row, a `rule` between neighbours and none
 * above the first or below the last. A nested list (a form's rows) is one
 * row of its parent and divides its own rows the same way. A `title` heads a
 * group of rows inside a section (Brand facts' Add a fact), 12 above them.
 */
export function SettingRows({
  label,
  title,
  titleId,
  className,
  children,
}: Readonly<{
  label?: string;
  title?: string;
  titleId?: string;
  className?: string;
  children: ReactNode;
}>) {
  const rows = (
    <div
      data-setting-rows=""
      aria-label={label}
      role={label ? 'group' : undefined}
      className={cn('divide-rule grid min-w-0 divide-y *:py-3 *:first:pt-0 *:last:pb-0', className)}
    >
      {children}
    </div>
  );
  if (!title) return rows;
  return (
    <div className="border-rule grid min-w-0 gap-3 border-t pt-4">
      <h3 id={titleId} className={textRole('subheading')}>
        {title}
      </h3>
      {rows}
    </div>
  );
}

/**
 * One settings row: at the left its name and, under it, a muted line saying
 * what it does; at the right, on the same line, its current value in `ink-2`
 * and its action (a button, a select). A row's own content that needs the
 * width (a notice, a long list) goes in `children`, under the row. `control`
 * is a form control in the 320 column `SettingField` uses, for a control
 * that names itself (a select, a checkbox group).
 */
export function SettingRow({
  label,
  description,
  value,
  action,
  control,
  children,
}: Readonly<{
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  /** The setting's current value, read-only, at the right. */
  value?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}>) {
  const end = value !== undefined && value !== null ? true : Boolean(action);
  return (
    <div data-setting-row="" className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <RowName label={label} description={description} />
        {end ? (
          <div className="flex max-w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-2">
            {value === undefined || value === null ? null : (
              <div className={textRole('body', 'text-ink-2 min-w-0 text-end break-words')}>
                {value}
              </div>
            )}
            {action}
          </div>
        ) : null}
        {control ? <div className={CONTROL_COLUMN}>{control}</div> : null}
      </div>
      {children}
    </div>
  );
}

const CONTROL_COLUMN = 'grid w-80 max-w-full min-w-0 gap-1 *:w-full';

/**
 * A form field as a settings row: its label and hint at the left, the control
 * at the right in one 320 column (so a form's controls line up), its error
 * under the control. `wide` puts the control under the label across the row,
 * for text that needs the width (a description, a list of entries).
 */
export function SettingField({
  label,
  hint,
  error,
  required,
  wide = false,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  error?: ReactNode;
  required?: boolean;
  wide?: boolean;
  children: (props: ControlProps) => ReactNode;
}>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const control = children({
    id,
    required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  });
  const name = (
    <div className="grid min-w-0 flex-1 basis-60 content-start gap-1">
      <label htmlFor={id} className={textRole('label')}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-ink-2 ms-0.5">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className={textRole('body', 'text-ink-2')}>
          {hint}
        </p>
      ) : null}
    </div>
  );
  const foot = error ? <FieldFoot id={errorId} error={error} /> : null;
  if (wide)
    return (
      <div data-setting-row="" className="grid min-w-0 gap-3">
        {name}
        <div className="grid min-w-0 gap-1">
          {control}
          {foot}
        </div>
      </div>
    );
  return (
    <div
      data-setting-row=""

      className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-2"
    >
      {name}
      <div className={CONTROL_COLUMN}>
        {control}
        {foot}
      </div>
    </div>
  );
}

function RowName({ label, description }: Readonly<{ label: ReactNode; description?: ReactNode }>) {
  return (
    <div className="grid min-w-0 flex-1 basis-60 gap-1">
      <div className={textRole('label')}>{label}</div>
      {description === undefined || description === null ? null : (
        <div className={textRole('body', 'text-ink-2 min-w-0 break-words')}>{description}</div>
      )}
    </div>
  );
}
