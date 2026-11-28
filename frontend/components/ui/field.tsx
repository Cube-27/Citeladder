import { useId, type ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { CircleAlert } from '@/lib/icons';
import { cn } from '@/lib/utils';

export type ControlProps = {
  id: string;
  required?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

export const fieldLabelId = (id: string) => `${id}-label`;

export function Field({
  label,
  hint,
  error,
  required,
  count,
  layout = 'stack',
  wide = false,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  error?: ReactNode;
  required?: boolean;
  count?: { used: number; max: number };
  layout?: 'stack' | 'row';
  wide?: boolean;
  children: (props: ControlProps) => ReactNode;
}>) {
  const className = wide ? 'desktop:col-span-2' : undefined;
  const id = useId();
  const messageId = `${id}-msg`;
  const message = error ?? hint;
  const name = <FieldName label={label} required={required} />;
  const control = children({
    id,
    required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': message ? messageId : undefined,
  });
  const foot = <FieldFoot id={messageId} hint={hint} error={error} count={count} />;

  if (layout === 'row')
    return (
      <FieldRow
        label={label}
        required={required}
        labelFor={id}
        labelId={fieldLabelId(id)}
        className={className}
      >
        {control}
        {foot}
      </FieldRow>
    );
  return (
    <div
      data-form-field=""
      className={cn('flex min-w-0 flex-col gap-1 [[data-public-surface]_&]:gap-2', className)}
    >
      <label
        id={fieldLabelId(id)}
        htmlFor={id}
        className="text-label text-ink [[data-public-surface]_&]:font-plain"
      >
        {name}
      </label>
      {control}
      {foot}
    </div>
  );
}

export function FieldName({ label, required }: Readonly<{ label: string; required?: boolean }>) {
  return (
    <>
      {label}
      {required ? (
        <span aria-hidden="true" className="text-ink-2 ms-0.5">
          *
        </span>
      ) : null}
    </>
  );
}

export function FieldCount({ used, max }: Readonly<{ used: number; max: number }>) {
  return (
    <span
      className={cn(
        'text-caption ms-auto shrink-0 tabular-nums',
        used >= max ? 'text-ink' : 'text-ink-2',
      )}
    >
      {`${used}/${max}`}
    </span>
  );
}

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
        'grid min-w-0 grid-cols-label-value items-start gap-x-6 gap-y-1 phone:grid-cols-1',
        className,
      )}
    >
      <Label
        htmlFor={labelFor}
        id={labelId}
        className="text-label text-ink phone:min-h-0 flex min-h-8 items-center"
      >
        <FieldName label={label} required={required} />
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
  let note: ReactNode = <span />;
  if (error) {
    note = (
      <p id={id} role="alert" className="text-caption text-negative flex items-start gap-1">
        <Icon icon={CircleAlert} size="flush" appOnly />
        <span>{error}</span>
      </p>
    );
  } else if (hint) {
    note = (
      <p id={id} className="text-caption text-ink-2">
        {hint}
      </p>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3">
      {note}
      {count ? <FieldCount used={count.used} max={count.max} /> : null}
    </div>
  );
}
