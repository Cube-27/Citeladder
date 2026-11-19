import { useId, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

export type ControlProps = {
  id: string;
  required?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

/**
 * Field — one frame for Input, Textarea, Select, Combobox, DateField and
 * SearchField: the label above in the `label` role,
 * 8px to the control, and one line of help or error below in `caption`.
 * Never help and error together: the error replaces the help, in crimson
 * with its glyph, linked to the control. An optional counter ("48/200") sits
 * at the right of that line in mono, turning `ink` at the limit.
 * `layout="row"` puts the label in a 160 column at the left and the control
 * with its help or error at the right; at phone width the two stack.
 */
export function Field({
  label,
  hint,
  error,
  required,
  count,
  layout = 'stack',
  className,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  error?: ReactNode;
  required?: boolean;
  /** The characters used and the limit, for a Textarea with `maxLength`. */
  count?: { used: number; max: number };
  layout?: 'stack' | 'row';
  className?: string;
  children: (props: ControlProps) => ReactNode;
}>) {
  const id = useId();
  const messageId = `${id}-msg`;
  const message = error ?? hint;
  const name = (
    <>
      {label}
      {/* Seen only: the control itself tells assistive tech it is required. */}
      {required ? (
        <span aria-hidden="true" className="text-ink-2 ms-0.5">
          *
        </span>
      ) : null}
    </>
  );
  const control = children({
    id,
    required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': message ? messageId : undefined,
  });
  const foot = <FieldFoot id={messageId} hint={hint} error={error} count={count} />;

  if (layout === 'row')
    return (
      <FieldRow label={label} required={required} labelFor={id} className={className}>
        {control}
        {foot}
      </FieldRow>
    );
  return (
    <div
      data-form-field=""
      className={cn('flex min-w-0 flex-col gap-1 [[data-public-surface]_&]:gap-2', className)}
    >
      <label htmlFor={id} className="type-label [[data-public-surface]_&]:font-normal">
        {name}
      </label>
      {control}
      {foot}
    </div>
  );
}

/**
 * The `layout="row"` frame on its own, for a row whose control is a group (a
 * fieldset of chips): without `labelFor` the label is a span with `labelId`,
 * for the group's `aria-labelledby`. The label centres on a 32 control.
 */
export function FieldRow({
  label,
  required,
  labelFor,
  labelId,
  className,
  children,
}: Readonly<{
  label: string;
  required?: boolean;
  labelFor?: string;
  labelId?: string;
  className?: string;
  children: ReactNode;
}>) {
  const Label = labelFor ? 'label' : 'span';
  return (
    <div
      data-form-field=""
      className={cn(
        'grid min-w-0 grid-cols-[10rem_minmax(0,1fr)] items-start gap-x-6 gap-y-1 phone:grid-cols-1',
        className,
      )}
    >
      <Label
        htmlFor={labelFor}
        id={labelId}
        className="type-label phone:min-h-0 flex min-h-8 items-center"
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="text-ink-2 ms-0.5">
            *
          </span>
        ) : null}
      </Label>
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </div>
  );
}

export function FieldFoot({
  id,
  hint,
  error,
  count,
}: Readonly<{
  id: string;
  hint?: string;
  error?: ReactNode;
  count?: { used: number; max: number };
}>) {
  if (!hint && !error && !count) return null;
  // The error replaces the hint while it stands; an empty slot keeps the count right.
  let note: ReactNode = <span />;
  if (error) {
    note = (
      <p id={id} role="alert" className="type-caption text-negative flex items-start gap-1">
        <Icon icon={CircleAlert} className="my-0 [[data-public-surface]_&]:hidden" />
        <span>{error}</span>
      </p>
    );
  } else if (hint) {
    note = (
      <p id={id} className="type-caption">
        {hint}
      </p>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3">
      {note}
      {count ? (
        <span
          className={cn(
            'type-caption ms-auto shrink-0 tabular-nums',
            count.used >= count.max ? 'text-ink' : 'text-ink-2',
          )}
        >
          {`${count.used}/${count.max}`}
        </span>
      ) : null}
    </div>
  );
}
