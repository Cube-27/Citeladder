import { type ComponentProps, useState } from 'react';

import { Eye, EyeOff } from '@/lib/icons';
import { Field, type ControlProps } from '@/components/ui/field';
import { FieldEndButton, Input } from '@/components/ui/input';

type PasswordInputProps = Omit<
  ComponentProps<typeof Input>,
  'type' | 'autoComplete' | 'placeholder' | 'endContent' | 'endContentFlush'
>;

export type PasswordFieldProps = Readonly<{
  label: string;
  error?: string;
  inputProps: PasswordInputProps;
  autoComplete: 'current-password' | 'new-password';
  placeholder: string;
}>;

export function PasswordInput({
  label,
  inputProps,
  autoComplete,
  placeholder,
  control,
}: Omit<PasswordFieldProps, 'error'> & Readonly<{ control: ControlProps }>) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...control}
      {...inputProps}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      placeholder={placeholder}
      endContentFlush
      endContent={
        <FieldEndButton
          icon={visible ? EyeOff : Eye}
          label={`${visible ? 'Hide' : 'Show'} ${label}`}
          onClick={() => setVisible((current) => !current)}
        />
      }
    />
  );
}

export function PasswordField({ error, ...props }: PasswordFieldProps) {
  return (
    <Field label={props.label} required error={error}>
      {(control) => <PasswordInput {...props} control={control} />}
    </Field>
  );
}
