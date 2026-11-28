import { useId, type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';

import { IconButton } from '@/components/ui/button';
import { FieldFoot, type ControlProps } from '@/components/ui/field';
import { Section, SectionBleed, SectionDescription, SectionHeader } from '@/components/ui/section';

import { Check, Pencil, Trash2, X } from '@/lib/icons';
import { cn } from '@/lib/utils';

import './setting-row.css';

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
  status?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
  region?: boolean;
  children: ReactNode;
}>) {
  const titleId = useId();
  return (
    <Section id={id} aria-labelledby={region ? titleId : undefined} data-settings-group="">
      <SectionHeader actions={action}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2
            id={titleId}
            className="text-label text-ink flex min-w-0 items-center gap-2 break-words"
          >
            {title}
          </h2>
          {status}
        </div>
        {description ? <SectionDescription>{description}</SectionDescription> : null}
      </SectionHeader>
      {children}
    </Section>
  );
}

export function SettingRows({
  label,
  foot,
  onSubmit,
  density = 'compact',
  children,
}: Readonly<{
  label?: string;
  foot?: ReactNode;
  density?: 'compact' | 'roomy';
  onSubmit?: HTMLAttributes<HTMLElement>['onSubmit'];
  children: ReactNode;
}>) {
  return (
    <SectionBleed
      rows
      as={onSubmit ? 'form' : 'div'}
      noValidate={onSubmit ? true : undefined}
      onSubmit={onSubmit}
      data-setting-rows={density}
      aria-label={label}
      role={label ? 'group' : undefined}
    >
      {children}
      {foot ? <div className="flex flex-wrap items-center justify-end gap-2">{foot}</div> : null}
    </SectionBleed>
  );
}

export function SettingRow({
  label,
  description,
  value,
  action,
  control,
  wide = false,
  children,
}: Readonly<{
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  wide?: boolean;
  value?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}>) {
  const hasValue = value !== undefined && value !== null;
  return (
    <div data-setting-row="" className="grid min-h-13 min-w-0 content-center gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <RowName label={label} description={description} />
        {hasValue || action ? (
          <div className="ms-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
            {hasValue ? (
              <div className="text-body text-ink-2 min-w-0 text-end break-words">{value}</div>
            ) : null}
            {action}
          </div>
        ) : null}
        {control ? (
          <div className={cn('grid max-w-full min-w-0 *:w-full', wide ? 'w-120' : 'w-80')}>
            {control}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

const INLINE_ROW = 'flex min-h-13 min-w-0 flex-wrap justify-between gap-x-6 gap-y-2';

const FIELD_LAYOUT = {
  stacked: { row: 'grid min-h-13 min-w-0 gap-2', label: 'flex-1', control: undefined },
  narrow: {
    row: cn(INLINE_ROW, 'items-center'),
    label: 'flex-1',
    control: 'w-44 max-w-full *:w-full',
  },
  wide: {
    row: cn(INLINE_ROW, 'items-center'),
    label: 'flex-1',
    control: 'w-80 max-w-full *:w-full',
  },
  fill: {
    row: cn(INLINE_ROW, 'items-baseline'),
    label: 'shrink-0',
    control: 'flex-1 basis-60 *:w-full',
  },
} as const;

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
  inline?: boolean | 'wide' | 'fill';
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
  const layout = FIELD_LAYOUT[inline === true ? 'narrow' : inline || 'stacked'];
  return (
    <div data-setting-row="" className={layout.row}>
      <div className={cn('grid min-w-0 basis-60 content-start gap-0.5', layout.label)}>
        <label htmlFor={id} className="text-label text-ink">
          {label}
          {required ? (
            <span aria-hidden="true" className="text-ink-2 ms-0.5">
              *
            </span>
          ) : null}
        </label>
        {hint ? (
          <p id={hintId} className="text-caption text-ink-2">
            {hint}
          </p>
        ) : null}
      </div>
      <div className={cn('grid min-w-0 gap-1', layout.control)}>
        {control}
        {error ? <FieldFoot id={errorId} error={error} /> : null}
      </div>
    </div>
  );
}

function RowName({ label, description }: Readonly<{ label: ReactNode; description?: ReactNode }>) {
  return (
    <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
      <div className="text-label text-ink">{label}</div>
      {description === undefined || description === null ? null : (
        <div className="text-caption text-ink-2 min-w-0 break-words">{description}</div>
      )}
    </div>
  );
}

const ROW_ACTIONS = { edit: Pencil, delete: Trash2, save: Check, cancel: X } as const;

export function RowAction({
  kind,
  ...props
}: Readonly<
  Omit<ComponentProps<typeof IconButton>, 'icon' | 'variant'> & { kind: keyof typeof ROW_ACTIONS }
>) {
  return <IconButton {...props} icon={ROW_ACTIONS[kind]} />;
}
