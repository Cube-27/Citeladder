import type { FormEvent, ReactNode } from 'react';
import { Lock } from '@/lib/icons';

import './page-form.css';

/**
 * PageForm: a website form card (contact, demo) with its header, a status
 * slot, the fields, and a foot holding the Turnstile check and the submit
 * button. The Turnstile slot is reserved at 300 × 65 before the widget
 * loads, so the submit button never moves.
 */
export function PageForm({
  title,
  description,
  status,
  turnstile,
  submit,
  note,
  onSubmit,
  busy = false,
  as: Heading = 'h2',
  children,
}: Readonly<{
  title?: string;
  description?: ReactNode;
  /** A Callout for the submit result, above the fields. */
  status?: ReactNode;
  /** The Turnstile widget; `false` when the form has no check. */
  turnstile?: ReactNode | false;
  submit: ReactNode;
  note?: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** True while a submission is in flight. */
  busy?: boolean;
  as?: 'h2' | 'h3';
  children: ReactNode;
}>) {
  return (
    <form
      className="cl-page-form"
      noValidate
      aria-label={title}
      aria-busy={busy}
      onSubmit={onSubmit}
    >
      {(title || description) && (
        <header className="cl-page-form-head">
          {title && <Heading className="cl-page-form-title">{title}</Heading>}
          {description && <p className="cl-page-form-desc">{description}</p>}
        </header>
      )}
      {status && <div className="cl-page-form-status">{status}</div>}
      <div className="cl-page-form-fields">{children}</div>
      <div className="cl-page-form-foot">
        {turnstile !== false && (
          <div className="cl-page-form-turnstile">
            {turnstile ?? (
              <span className="cl-page-form-turnstile-slot">
                <span className="cl-page-form-turnstile-line">
                  <Lock aria-hidden className="size-4" />
                  Verification check loads here
                </span>
              </span>
            )}
          </div>
        )}
        <div className="cl-page-form-submit">{submit}</div>
      </div>
      {note && <p className="cl-page-form-note">{note}</p>}
    </form>
  );
}
