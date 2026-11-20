import { useId, type ReactNode } from 'react';

import { FieldFoot, type ControlProps } from '@/components/ui/field';
import { SLIP_FACE } from '@/components/ui/slip';
import { StateHeadingLevelContext } from '@/components/ui/state-heading-level';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * One group of the Settings layout (docs/design.md): its heading, an optional
 * one-line caption 4 below, the group's one action at the right of the
 * heading, then 12 below its body: a `SettingRows` frame, a `DataTable`, or a
 * read's state. Notices about the group sit between the head and the body.
 * A group whose body is one table is not a region itself (`region={false}`):
 * the table is the region, under the same name.
 */
export function SettingsGroup({
  title,
  status,
  description,
  action,
  id,
  region = true,
  children,
}: Readonly<{
  title: ReactNode;
  /** A status mark on the heading's line, 8 after it. */
  status?: ReactNode;
  description?: ReactNode;
  /** The group's one action (Invite, Create key): secondary, at the heading's right. */
  action?: ReactNode;
  /** The section's anchor, for a page link to it (`#change-plan`). */
  id?: string;
  region?: boolean;
  children: ReactNode;
}>) {
  const titleId = useId();
  return (
    <section
      id={id}
      aria-labelledby={region ? titleId : undefined}
      data-settings-group=""
      className="grid min-w-0 gap-3"
    >
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 flex-1 basis-60 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2
              id={titleId}
              className={textRole('heading', 'flex min-w-0 items-center gap-2 break-words')}
            >
              {title}
            </h2>
            {status}
          </div>
          {description ? <p className={textRole('caption')}>{description}</p> : null}
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </header>
      <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
    </section>
  );
}

/**
 * A group's framed list of rows: the one framed surface, a hairline between
 * rows, each row (whatever it is) padded 12 by 16 and at least 52 high. A
 * form's Save goes in `foot`, right-aligned under the last row.
 */
export function SettingRows({
  label,
  foot,
  children,
}: Readonly<{ label?: string; foot?: ReactNode; children: ReactNode }>) {
  return (
    <div
      data-setting-rows=""
      aria-label={label}
      role={label ? 'group' : undefined}
      className={settingRowsClasses()}
    >
      {children}
      {foot ? <div className="flex flex-wrap items-center justify-end gap-2">{foot}</div> : null}
    </div>
  );
}

/** The frame's recipe, for a list that must be a `ul` (a provider per `li`). */
export function settingRowsClasses(className?: string) {
  return cn(
    SLIP_FACE,
    'divide-rule grid min-w-0 divide-y overflow-hidden *:min-h-13 *:px-4 *:py-3',
    className,
  );
}

/**
 * One setting row: its name and, under it, a caption saying what it does; at
 * the right its current value in `ink-2` and its action (a switch, a select,
 * a button). `control` is a form control that names itself, in a 320 column.
 * Content that needs the row's width (a notice) goes in `children`, under it.
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
  const hasValue = value !== undefined && value !== null;
  return (
    <div data-setting-row="" className="grid min-w-0 content-center gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <RowName label={label} description={description} />
        {hasValue || action ? (
          <div className="flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
            {hasValue ? (
              <div className={textRole('body', 'text-ink-2 min-w-0 text-end break-words')}>
                {value}
              </div>
            ) : null}
            {action}
          </div>
        ) : null}
        {control ? <div className="grid w-80 max-w-full min-w-0 *:w-full">{control}</div> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * A form field as a settings row: its label and hint, then the control under
 * them across the row, its error under the control. `inline` puts a short
 * choice (a select) at the row's right instead, no wider than it needs.
 */
export function SettingField({
  label,
  hint,
  error,
  required,
  inline = false,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  error?: ReactNode;
  required?: boolean;
  inline?: boolean;
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
  return (
    <div
      data-setting-row=""
      className={
        inline
          ? 'flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2'
          : 'grid min-w-0 gap-2'
      }
    >
      <div className="grid min-w-0 flex-1 basis-60 content-start gap-0.5">
        <label htmlFor={id} className={textRole('label')}>
          {label}
          {required ? (
            <span aria-hidden="true" className="text-ink-2 ms-0.5">
              *
            </span>
          ) : null}
        </label>
        {hint ? (
          <p id={hintId} className={textRole('caption')}>
            {hint}
          </p>
        ) : null}
      </div>
      <div className={cn('grid min-w-0 gap-1', inline && 'w-44 max-w-full *:w-full')}>
        {control}
        {error ? <FieldFoot id={errorId} error={error} /> : null}
      </div>
    </div>
  );
}

function RowName({ label, description }: Readonly<{ label: ReactNode; description?: ReactNode }>) {
  return (
    <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
      <div className={textRole('label')}>{label}</div>
      {description === undefined || description === null ? null : (
        <div className={textRole('caption', 'min-w-0 break-words')}>{description}</div>
      )}
    </div>
  );
}
