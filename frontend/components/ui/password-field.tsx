import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

import { Field } from '@/components/ui/field';
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

/** A labelled password field with a reveal control at its end. */
export function PasswordField({
  label,
  error,
  inputProps,
  autoComplete,
  placeholder,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} required error={error}>
      {(props) => (
        <Input
          {...props}
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
      )}
    </Field>
  );
}
