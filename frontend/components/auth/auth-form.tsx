'use client';

import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type ComponentProps, type ReactNode, useId, useState } from 'react';

import { Alert as MktAlert } from '@/components/ui/alert';
import { Checkbox, CheckboxCaption } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { FlowButton, FlowInput } from '@/components/ui/flow-controls';
import { type BrandGlyph, Icon } from '@/components/ui/icon';
import { FieldEndButton } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { authApi } from '@/lib/api/auth';
import { safeAuthReturnPath } from '@/lib/auth/auth-return-path';
import { ApiError } from '@/lib/api/errors';
import { websiteHref } from '@/lib/config/app-link';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { cn } from '@/lib/utils';

type InputProps = Omit<ComponentProps<typeof FlowInput>, 'icon'>;

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
        <FlowInput
          {...props}
          {...inputProps}
          icon={Mail}
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
        <FlowInput
          {...props}
          {...inputProps}
          icon={LockKeyhole}
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
 * The Terms decision, made on the sign-in and sign-up forms for email and
 * Google alike, so no screen after sign-in asks again.
 *
 * Unticked by default and required. The Privacy Policy is linked as notice,
 * not bundled into the agreement: processing does not rest on this consent.
 * While unticked, a hint (which the disabled ways in point to) says why they
 * wait; ticked, it keeps its line invisibly, so nothing moves.
 */
function TermsConsent({
  agreed,
  onChange,
  hintId,
}: Readonly<{
  agreed: boolean;
  onChange: (agreed: boolean) => void;
  hintId: string;
}>) {
  const noticeId = useId();
  return (
    <div className="auth-terms-consent grid">
      <Checkbox
        checked={agreed}
        onCheckedChange={(value) => onChange(value === true)}
        required
        aria-describedby={agreed ? noticeId : `${noticeId} ${hintId}`}
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
      <CheckboxCaption id={hintId} shown={!agreed}>
        Agree to the Terms of Service to continue.
      </CheckboxCaption>
    </div>
  );
}

/**
 * The Terms decision the form sends with every way in: the published revision
 * (undefined while it loads) and whether this form creates an account.
 */
type TermsDecision = { revision: string | undefined; signup: boolean };

/**
 * Continue with Google. The start carries the Terms decision, sealed in the
 * signed state for the callback to record; only a sign-up start can create an
 * account. `consentHint` points the disabled button at why it waits.
 */
function GoogleEntry({
  revision,
  signup,
  consentHint,
}: Readonly<{
  revision: string | undefined;
  signup: boolean;
  consentHint: string | undefined;
}>) {
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start() {
    // The button stays live for the whole round trip otherwise, and a second
    // click starts a second authorization before the first can redirect.
    if (pending || consentHint || !revision) return;
    setPending(true);
    setNotice(null);
    try {
      const { authorize_url } = await authApi.oauthStart('google', {
        returnTo: safeAuthReturnPath(new URLSearchParams(window.location.search).get('return_to')),
        termsRevision: revision,
        signup,
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
      <FlowButton
        variant="secondary"
        disabled={pending || Boolean(consentHint) || !revision}
        aria-describedby={consentHint}
        onClick={() => void start()}
      >
        <Icon icon={GoogleGlyph} />
        <span>{pending ? 'Starting Google sign-in…' : 'Continue with Google'}</span>
      </FlowButton>
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
  showForm = true,
  showFooter = true,
  terms,
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
  showForm?: boolean;
  showFooter?: boolean;
  /**
   * Sign-in and sign-up: the required Terms box, and Continue with Google.
   * Every way in stays disabled until the box is ticked and the published
   * revision has loaded. Mailbox and unavailable screens authenticate no one
   * and omit it.
   */
  terms?: TermsDecision;
  children: ReactNode;
}>) {
  const consent = useConsentGate(showForm ? terms : undefined);

  const handleSubmit: NonNullable<ComponentProps<'form'>['onSubmit']> = (event) => {
    if (consent.held) {
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
        {consent.terms ? (
          <>
            <GoogleEntry
              revision={consent.terms.revision}
              signup={consent.terms.signup}
              consentHint={consent.hint}
            />
            <p className="auth-form-divider flow-meta text-center">or</p>
          </>
        ) : null}

        {error ? <MktAlert>{error}</MktAlert> : null}

        {showForm ? (
          <form noValidate onSubmit={handleSubmit}>
            <Stack gap="workspace" className="auth-email-form">
              {children}

              {consent.terms ? (
                <TermsConsent
                  agreed={consent.agreed}
                  onChange={consent.setAgreed}
                  hintId={consent.hintId}
                />
              ) : null}

              <FlowButton
                type="submit"
                disabled={pending || consent.held}
                aria-describedby={consent.hint}
              >
                {pending ? pendingLabel : submitLabel}
              </FlowButton>
            </Stack>
          </form>
        ) : null}

        {showFooter ? (
          <AuthFormFooter
            prompt={footerPrompt}
            href={footerHref}
            label={footerLabel}
            emphasis={footerLinkVariant === 'emphasis'}
          />
        ) : null}
      </Stack>
    </Stack>
  );
}

/**
 * The Terms box's state for a form that authenticates (`terms` given), or
 * nothing to hold for one that does not. `hint` is the id the disabled ways in
 * point to while the box is unticked; `held` stays true until it is ticked
 * and the published revision has loaded.
 */
function useConsentGate(terms: TermsDecision | undefined) {
  const [agreed, setAgreed] = useState(false);
  const hintId = useId();
  const hint = terms && !agreed ? hintId : undefined;
  const held = Boolean(hint) || (terms !== undefined && !terms.revision);
  return { terms, agreed, setAgreed, hintId, hint, held };
}

/** The line under the form that switches between sign-in and sign-up, or back to sign-in. */
function AuthFormFooter({
  prompt,
  href,
  label,
  emphasis,
}: Readonly<{ prompt: string; href: string; label: string; emphasis: boolean }>) {
  return (
    <p className="auth-form-footer flow-help text-center">
      {prompt}{' '}
      <Link to={href} className={cn('flow-exit', emphasis && 'flow-auth-switch-link')}>
        {label}
      </Link>
    </p>
  );
}
