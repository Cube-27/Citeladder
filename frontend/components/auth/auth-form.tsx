'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type ComponentProps, type ReactNode, type Ref, useId, useRef, useState } from 'react';

import { Alert as MktAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pressable } from '@/components/ui/pressable';
import { authApi } from '@/lib/api/auth';
import { safeAuthReturnPath } from '@/lib/auth/auth-return-path';
import { ApiError } from '@/lib/api/errors';
import { recordSignInTermsConsent } from '@/lib/auth/terms-consent';
import { websiteHref } from '@/lib/config/app-link';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { cn } from '@/lib/utils';

type InputProps = ComponentProps<typeof Input>;

function GoogleIcon({ className = 'size-4 shrink-0' }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="var(--color-brand-google-blue)"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3h3.86c2.26-2.09 3.68-5.17 3.68-9.12z"
      />
      <path
        fill="var(--color-brand-google-green)"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="var(--color-brand-google-yellow)"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="var(--color-brand-google-red)"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

export function AuthEmailField({
  error,
  inputProps,
}: Readonly<{ error?: string; inputProps: InputProps }>) {
  return (
    <Field label="Email address" required error={error}>
      {(props) => (
        <Input
          {...props}
          {...inputProps}
          type="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="hello@app.com"
          size="lg"
        />
      )}
    </Field>
  );
}

export function AuthPasswordField({
  label,
  error,
  inputProps,
  autoComplete,
  placeholder,
  visibilityLabel = label,
}: Readonly<{
  label: string;
  error?: string;
  inputProps: InputProps;
  autoComplete: 'current-password' | 'new-password';
  placeholder: string;
  visibilityLabel?: string;
}>) {
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
          size="lg"
          endContent={
            <Pressable
              type="button"
              onClick={() => setVisible((current) => !current)}
              className="text-muted hover:text-foreground grid size-7 place-items-center rounded-[var(--radius-control)] transition-colors"
              aria-label={`${visible ? 'Hide' : 'Show'} ${visibilityLabel}`}
            >
              {visible ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </Pressable>
          }
        />
      )}
    </Field>
  );
}

/**
 * The Terms decision, made where the visitor signs in.
 *
 * Unticked by default and required. The Privacy Policy is linked as notice,
 * not bundled into the agreement: processing does not rest on this consent.
 */
function TermsConsent({
  ref,
  agreed,
  missing,
  onChange,
}: Readonly<{
  ref: Ref<HTMLDivElement>;
  agreed: boolean;
  missing: boolean;
  onChange: (agreed: boolean) => void;
}>) {
  const errorId = useId();
  const noticeId = useId();
  return (
    <div ref={ref} className="auth-terms-consent grid gap-0.5">
      <Checkbox
        checked={agreed}
        onCheckedChange={(value) => onChange(value === true)}
        required
        aria-describedby={missing ? `${errorId} ${noticeId}` : noticeId}
        label={
          <>
            I agree to the{' '}
            <a
              href={websiteHref('/terms')}
              target="_blank"
              rel="noreferrer"
              className="auth-legal-link"
            >
              Terms of Service
            </a>
          </>
        }
      />
      <p id={noticeId} className="type-caption ps-[calc(var(--control-height-md)+0.5rem)]">
        Our{' '}
        <a
          href={websiteHref('/privacy')}
          target="_blank"
          rel="noreferrer"
          className="auth-legal-link"
        >
          Privacy Policy
        </a>{' '}
        explains how we process your data.
      </p>
      <p
        id={errorId}
        role={missing ? 'alert' : undefined}
        aria-hidden={!missing}
        className={cn(
          'type-caption text-danger-text ps-[calc(var(--control-height-md)+0.5rem)]',
          !missing && 'invisible',
        )}
      >
        Agree to the Terms of Service to continue.
      </p>
    </div>
  );
}

export function AuthFormShell({
  title,
  description,
  error,
  onSubmit,
  pending,
  submitLabel,
  pendingLabel,
  footerPrompt,
  footerHref,
  footerLabel,
  footerLinkVariant = 'default',
  showOAuth = true,
  showForm = true,
  showFooter = true,
  requireTerms = true,
  children,
}: Readonly<{
  title: string;
  description: string;
  error?: string;
  onSubmit: ComponentProps<'form'>['onSubmit'];
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  footerPrompt: string;
  footerHref: string;
  footerLabel: string;
  footerLinkVariant?: 'default' | 'emphasis';
  showOAuth?: boolean;
  showForm?: boolean;
  showFooter?: boolean;
  requireTerms?: boolean;
  children: ReactNode;
}>) {
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const consentRef = useRef<HTMLDivElement>(null);
  // Both ways in lead into the app, so both carry the same Terms decision.
  const requiresConsent = requireTerms && (showForm || showOAuth);

  /** Hold any way in until the Terms box is ticked; remember the decision once it is. */
  function consentGiven(): boolean {
    if (!requiresConsent) return true;
    if (!agreed) {
      setConsentMissing(true);
      consentRef.current?.querySelector<HTMLElement>('button[role="checkbox"]')?.focus();
      return false;
    }
    recordSignInTermsConsent();
    return true;
  }

  const handleSubmit: NonNullable<ComponentProps<'form'>['onSubmit']> = (event) => {
    if (!consentGiven()) {
      event.preventDefault();
      return;
    }
    onSubmit?.(event);
  };

  async function handleGoogleSignIn() {
    // The button stays live for the whole round trip otherwise, and a second
    // click starts a second authorization before the first can redirect.
    if (oauthPending) return;
    if (!consentGiven()) return;
    setOauthPending(true);
    setOauthNotice(null);
    try {
      const { authorize_url } = await authApi.oauthStart(
        'google',
        undefined,
        safeAuthReturnPath(new URLSearchParams(window.location.search).get('return_to')),
      );
      hardNavigate(authorize_url);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setOauthNotice('Google sign-in is coming soon — please use email below.');
      } else {
        setOauthNotice('Unable to start Google sign-in. Please try email below.');
      }
    } finally {
      // Cleared even on the success path: `hardNavigate` may be a no-op in a
      // test, and a permanently disabled button would strand the user.
      setOauthPending(false);
    }
  }

  return (
    <div className="auth-form-shell grid w-full gap-6">
      <div className="auth-form-heading grid gap-2">
        <h1 className="flow-title">{title}</h1>
        <p className="flow-help">{description}</p>
      </div>

      <div className="auth-form-body grid gap-4">
        {showOAuth && (
          <>
            <Button
              variant="secondary"
              size="lg"
              className="w-full gap-2"
              disabled={oauthPending}
              onClick={() => void handleGoogleSignIn()}
            >
              <GoogleIcon />
              <span>{oauthPending ? 'Starting Google sign-in…' : 'Continue with Google'}</span>
            </Button>

            {oauthNotice ? <MktAlert>{oauthNotice}</MktAlert> : null}

            <div className="auth-form-divider flex items-center gap-3">
              <span className="bg-border h-px flex-1" aria-hidden="true" />
              <span className="flow-meta">or</span>
              <span className="bg-border h-px flex-1" aria-hidden="true" />
            </div>
          </>
        )}

        {error ? <MktAlert>{error}</MktAlert> : null}

        {showForm ? (
          <form noValidate onSubmit={handleSubmit} className="auth-email-form grid gap-4">
            {children}

            {requiresConsent && (
              <TermsConsent
                ref={consentRef}
                agreed={agreed}
                missing={consentMissing}
                onChange={(value) => {
                  setAgreed(value);
                  if (value) setConsentMissing(false);
                }}
              />
            )}

            <Button
              type="submit"
              size="lg"
              className="auth-form-submit mt-2 w-full"
              disabled={pending}
            >
              {pending ? pendingLabel : submitLabel}
            </Button>
          </form>
        ) : null}

        {showFooter ? (
          <p className="auth-form-footer flow-help pt-2 text-center">
            {footerPrompt}{' '}
            <Link
              to={footerHref}
              className={cn(
                'flow-exit',
                footerLinkVariant === 'emphasis' && 'flow-auth-switch-link',
              )}
            >
              {footerLabel}
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
