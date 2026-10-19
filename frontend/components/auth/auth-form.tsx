'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type ComponentProps, type ReactNode, type Ref, useId, useState } from 'react';

import { Alert as MktAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox, CheckboxCaption } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { type BrandGlyph, Icon } from '@/components/ui/icon';
import { FieldEndButton, Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { authApi } from '@/lib/api/auth';
import { safeAuthReturnPath } from '@/lib/auth/auth-return-path';
import { ApiError } from '@/lib/api/errors';
import { recordSignupTermsConsent, useTermsConsent } from '@/lib/auth/terms-consent';
import { websiteHref } from '@/lib/config/app-link';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { cn } from '@/lib/utils';

type InputProps = ComponentProps<typeof Input>;

/** The Google "G", a brand glyph `Icon` sizes. */
const GoogleGlyph: BrandGlyph = (props) => {
  return (
    <svg viewBox="0 0 24 24" {...props}>
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
};

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

/**
 * The Terms decision, made once on the signup form for both email and Google.
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
    <div ref={ref} className="auth-terms-consent grid">
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
      <CheckboxCaption id={noticeId}>
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
      </CheckboxCaption>
      <CheckboxCaption id={errorId} tone="error" shown={missing}>
        Agree to the Terms of Service to continue.
      </CheckboxCaption>
    </div>
  );
}

/**
 * Continue with Google. A sign-up start carries the Terms revision, so only it
 * can create an account; `consentGiven` holds it until the box is ticked.
 */
function GoogleEntry({
  signupTermsRevision,
  disabled,
  consentGiven,
}: Readonly<{
  signupTermsRevision: string | undefined;
  disabled: boolean;
  consentGiven: () => boolean;
}>) {
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start() {
    // The button stays live for the whole round trip otherwise, and a second
    // click starts a second authorization before the first can redirect.
    if (pending || !consentGiven()) return;
    setPending(true);
    setNotice(null);
    try {
      const { authorize_url } = await authApi.oauthStart('google', {
        returnTo: safeAuthReturnPath(new URLSearchParams(window.location.search).get('return_to')),
        signupTermsRevision,
      });
      hardNavigate(authorize_url);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotice('Google sign-in is coming soon — please use email below.');
      } else {
        setNotice('Unable to start Google sign-in. Please try email below.');
      }
    } finally {
      // Cleared even on the success path: `hardNavigate` may be a no-op in a
      // test, and a permanently disabled button would strand the user.
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        disabled={pending || disabled}
        onClick={() => void start()}
      >
        <Icon icon={GoogleGlyph} />
        <span>{pending ? 'Starting Google sign-in…' : 'Continue with Google'}</span>
      </Button>
      {notice ? <MktAlert>{notice}</MktAlert> : null}
    </>
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
  signup,
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
  /**
   * Sign-up: both ways in create an account, so both wait for the Terms box
   * and carry the published revision (undefined while it loads). Sign-in
   * omits it and asks nothing.
   */
  signup?: { termsRevision: string | undefined };
  children: ReactNode;
}>) {
  const consent = useTermsConsent();
  const requiresConsent = Boolean(signup) && (showForm || showOAuth);
  const revisionPending = requiresConsent && !signup?.termsRevision;

  /** Hold any way in until the Terms box is ticked; remember the decision once it is. */
  function consentGiven(): boolean {
    if (!requiresConsent) return true;
    if (revisionPending || !consent.confirm()) return false;
    recordSignupTermsConsent();
    return true;
  }

  const handleSubmit: NonNullable<ComponentProps<'form'>['onSubmit']> = (event) => {
    if (!consentGiven()) {
      event.preventDefault();
      return;
    }
    onSubmit?.(event);
  };

  return (
    <Stack gap="section" className="auth-form-shell w-full">
      <Stack gap="compact" className="auth-form-heading">
        <h1 className="flow-title">{title}</h1>
        <p className="flow-help">{description}</p>
      </Stack>

      <Stack gap="workspace" className="auth-form-body">
        {showOAuth && (
          <>
            <GoogleEntry
              signupTermsRevision={signup?.termsRevision}
              disabled={revisionPending}
              consentGiven={consentGiven}
            />
            <p className="auth-form-divider flow-meta text-center">or</p>
          </>
        )}

        {error ? <MktAlert>{error}</MktAlert> : null}

        {showForm ? (
          <form noValidate onSubmit={handleSubmit}>
            <Stack gap="workspace" className="auth-email-form">
              {children}

              {requiresConsent && <TermsConsent {...consent.field} />}

              <Button
                type="submit"
                className="auth-form-submit w-full"
                disabled={pending || revisionPending}
              >
                {pending ? pendingLabel : submitLabel}
              </Button>
            </Stack>
          </form>
        ) : null}

        {showFooter ? (
          <p className="auth-form-footer flow-help text-center">
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
      </Stack>
    </Stack>
  );
}
