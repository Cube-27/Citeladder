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
 */
export function Field({
  label,
  hint,
  error,
  required,
  count,
  className,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  error?: ReactNode;
  required?: boolean;
  /** The characters used and the limit, for a Textarea with `maxLength`. */
  count?: { used: number; max: number };
  className?: string;
  children: (props: ControlProps) => ReactNode;
}>) {
  const id = useId();
  const messageId = `${id}-msg`;
  const message = error ?? hint;

  return (
    <div
      data-form-field=""
      className={cn('flex min-w-0 flex-col gap-1 [[data-public-surface]_&]:gap-2', className)}
    >
      <label htmlFor={id} className="type-label [[data-public-surface]_&]:font-normal">
        {label}
        {/* Seen only: the control itself tells assistive tech it is required. */}
        {required ? (
          <span aria-hidden="true" className="text-ink-2 ms-0.5">
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        required,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': message ? messageId : undefined,
      })}
      <FieldFoot id={messageId} hint={hint} error={error} count={count} />
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
