import { AlertCircle } from 'lucide-react';
import { useId } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Form controls for the Proof surface (auth screens). Same accessibility
 * contract as the app's Field — generated id, `aria-invalid`, and a
 * `role="alert"` error wired through `aria-describedby` — restyled onto the
 * marketing tokens so the logged-out funnel is one visual system end to end.
 */
export function MktField({
  label,
  hint,
  error,
  required,
  className,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /**
   * Renders the control. `required` is handed back rather than left to the
   * call site: the asterisk is `aria-hidden`, so a screen reader announces the
   * field as optional unless the flag reaches the input itself.
   */
  children: (props: {
    id: string;
    required?: boolean;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // The hint is only RENDERED when there is no error, so pointing
  // aria-describedby at it in the error case would reference a missing node.
  const describedBy =
    [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('gap-mkt-10 grid', className)}>
      <label htmlFor={id} className="text-mkt-sm text-mkt-ink-soft font-semibold">
        {label}
        {required && (
          <span aria-hidden className="text-mkt-error-text ml-mkt-6">
            *
          </span>
        )}
      </label>
      {children({
        id,
        required,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && !error && (
        <span id={hintId} className="text-mkt-sm text-mkt-ink-soft">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className="text-mkt-sm text-mkt-error-text">
          {error}
        </span>
      )}
    </div>
  );
}

export function MktInput({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      {...props}
      className={cn(
        'border-mkt-black-10 bg-mkt-surface-sunk text-mkt-ink placeholder:text-mkt-ink-soft rounded-mkt-sm',
        'focus:border-mkt-indigo focus:ring-mkt-frost text-mkt-body px-mkt-20 min-h-12 w-full border',
        'transition-[border-color,box-shadow,background-color] duration-200 outline-none',
        'focus:bg-mkt-surface aria-invalid:border-mkt-error focus:ring-2',
        className,
      )}
    />
  );
}

/** Inline form error banner — the only alert tone the auth screens need. */
export function MktAlert({ children }: Readonly<{ children: ReactNode }>) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="border-mkt-error bg-mkt-error-05 text-mkt-error-text rounded-mkt-sm text-mkt-sm gap-mkt-14 p-mkt-20 flex border"
    >
      <AlertCircle aria-hidden className="mt-mkt-6 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
