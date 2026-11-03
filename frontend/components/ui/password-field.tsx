'use client';

import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

import { Field } from '@/components/ui/field';
import { FlowInput } from '@/components/ui/flow-controls';
import { FieldEndButton, Input } from '@/components/ui/input';

type PasswordInputProps = Omit<
  ComponentProps<typeof FlowInput>,
  'type' | 'autoComplete' | 'placeholder' | 'endContent' | 'endContentFlush'
>;

export type PasswordFieldProps = Readonly<{
  label: string;
  error?: string;
  inputProps: PasswordInputProps;
  autoComplete: 'current-password' | 'new-password';
  placeholder: string;
  /** The name the reveal control speaks after "Show"/"Hide"; the label by default. */
  visibilityLabel?: string;
}>;

/**
 * A labelled password field with a reveal control at its end. `control` picks
 * the field atom: the product's 32px `Input`, or account access's 44px
 * `FlowInput`. Screens use `PasswordField` or the auth form's wrapper, never
 * this directly.
 */
export function PasswordFieldFrame({
  control: Control,
  label,
  error,
  inputProps,
  autoComplete,
  placeholder,
  visibilityLabel = label,
}: PasswordFieldProps & Readonly<{ control: typeof Input | typeof FlowInput }>) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} required error={error}>
      {(props) => (
        <Control
          {...props}
          {...inputProps}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          endContentFlush
          endContent={
            <FieldEndButton
              icon={visible ? EyeOff : Eye}
              label={`${visible ? 'Hide' : 'Show'} ${visibilityLabel}`}
              onClick={() => setVisible((current) => !current)}
            />
          }
        />
      )}
    </Field>
  );
}

/** The product's password field: the 32px field every other form uses. */
export function PasswordField(props: PasswordFieldProps) {
  return <PasswordFieldFrame control={Input} {...props} />;
}
