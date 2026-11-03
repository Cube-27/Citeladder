'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type ComponentProps, type ReactNode, useId, useState } from 'react';

import { Alert as MktAlert } from '@/components/ui/alert';
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
import type { Turnstile } from '@/lib/turnstile/use-turnstile';
import { cn } from '@/lib/utils';

type InputProps = ComponentProps<typeof FlowInput>;

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
          type="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="Your email address"
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
 * Google alike, so no screen after sign-in asks again: continuing is agreeing.
 * Every way in points to this line as its description. The Privacy Policy is
 * acknowledged as notice, not bundled into the agreement: processing does not
 * rest on this consent.
 */
function TermsNotice({ id, signup }: Readonly<{ id: string; signup: boolean }>) {
  return (
    <p id={id} className="auth-terms-notice flow-help text-center">
      By {signup ? 'creating an account' : 'continuing'}, you agree to the{' '}
      <a href={websiteHref('/terms')} target="_blank" rel="noreferrer" className="auth-legal-link">
        Terms of Service
      </a>{' '}
      and acknowledge the{' '}
      <a
        href={websiteHref('/privacy')}
        target="_blank"
        rel="noreferrer"
        className="auth-legal-link"
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}

/**
 * The Terms decision the form sends with every way in: the published revision
 * (undefined while it loads) and whether this form creates an account.
 */
type TermsDecision = { revision: string | undefined; signup: boolean };

/** A Google start's input: a sign-up start (given its widget) also carries the token. */
function googleStartInput(
  termsRevision: string,
  verification: Turnstile | undefined,
): Parameters<typeof authApi.oauthStart>[1] {
  const returnTo = safeAuthReturnPath(new URLSearchParams(window.location.search).get('return_to'));
  return verification
    ? { returnTo, termsRevision, signup: true, turnstileToken: verification.token() }
    : { returnTo, termsRevision, signup: false };
}

/** Why a Google start failed: the verification refusal says what to do itself. */
function googleStartNotice(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Unable to start Google sign-in. Please try email below.';
  if (err.code?.startsWith('human_verification_')) return err.message;
  if (err.status === 503) return 'Google sign-in is coming soon — please use email below.';
  return 'Unable to start Google sign-in. Please try email below.';
}

/**
 * Continue with Google. The start carries the Terms decision, sealed in the
 * signed state for the callback to record; only a sign-up start can create an
 * account. `termsNoticeId` is the agreement line the button is described by.
 */
function GoogleEntry({
  revision,
  signup,
  termsNoticeId,
  verification,
}: Readonly<{
  revision: string | undefined;
  signup: boolean;
  termsNoticeId: string;
  /** Sign-up's Turnstile widget: a sign-up start carries its token. */
  verification: Turnstile | undefined;
}>) {
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const unverified = signup && !verification?.solved;

  async function start() {
    // The button stays live for the whole round trip otherwise, and a second
    // click starts a second authorization before the first can redirect.
    if (pending || !revision || unverified) return;
    setPending(true);
    setNotice(null);
    try {
      const { authorize_url } = await authApi.oauthStart(
        'google',
        googleStartInput(revision, signup ? verification : undefined),
      );
      hardNavigate(authorize_url);
    } catch (err) {
      setNotice(googleStartNotice(err));
    } finally {
      // Cleared even on the success path: `hardNavigate` may be a no-op in a
      // test, and a permanently disabled button would strand the user.
      setPending(false);
      // The token is single-use, spent or not.
      if (signup) verification?.reset();
    }
  }

  return (
    <>
      <FlowButton
        variant="secondary"
        disabled={pending || !revision || unverified}
        aria-describedby={termsNoticeId}
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
  verification,
  children,
}: Readonly<{
  title: string;
  /** A line under the title; sign-in and sign-up have none unless they report something. */
  description?: string;
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
   * Sign-in and sign-up: Continue with Google, and the agreement line every
   * way in is described by. Every way in stays disabled until the published
   * revision has loaded. Mailbox and unavailable screens authenticate no one
   * and omit it.
   */
  terms?: TermsDecision;
  /**
   * Sign-up and the email-link requests: the Turnstile widget, in a reserved
   * slot between the fields and submit. Submit, and a sign-up's
   * Continue with Google, stay disabled until it hands over a token. Sign-in
   * omits it.
   */
  verification?: Turnstile;
  children: ReactNode;
}>) {
  const consent = useConsentGate(showForm ? terms : undefined, showForm ? verification : undefined);

  const handleSubmit: NonNullable<ComponentProps<'form'>['onSubmit']> = (event) => {
    if (consent.held) {
      event.preventDefault();
      return;
    }
    onSubmit?.(event);
  };

  return (
    <Stack gap="section" className="auth-form-shell w-full">
      <Stack gap="compact" className="auth-form-heading text-center">
        <h1 className="flow-title">{title}</h1>
        {description ? <p className="flow-help">{description}</p> : null}
      </Stack>

      <Stack gap="workspace" className="auth-form-body">
        {error ? <MktAlert>{error}</MktAlert> : null}

        {showForm ? (
          <form noValidate onSubmit={handleSubmit}>
            <Stack gap="workspace" className="auth-email-form">
              {children}

              {consent.verification ? <HumanCheck widget={consent.verification} /> : null}

              <FlowButton
                type="submit"
                disabled={pending || consent.held}
                aria-describedby={consent.terms ? consent.noticeId : undefined}
              >
                {pending ? pendingLabel : submitLabel}
              </FlowButton>
            </Stack>
          </form>
        ) : null}

        {consent.terms ? (
          <>
            <p className="auth-form-divider flow-meta">OR</p>
            <GoogleEntry
              revision={consent.terms.revision}
              signup={consent.terms.signup}
              termsNoticeId={consent.noticeId}
              verification={consent.verification}
            />
          </>
        ) : null}

        {showFooter ? (
          <AuthFormFooter
            prompt={footerPrompt}
            href={footerHref}
            label={footerLabel}
            emphasis={footerLinkVariant === 'emphasis'}
          />
        ) : null}

        {consent.terms ? <TermsNotice id={consent.noticeId} signup={consent.terms.signup} /> : null}
      </Stack>
    </Stack>
  );
}

/**
 * The Turnstile widget's slot. Its height is reserved before the widget loads
 * and kept after it completes, so nothing below it moves; if no widget can
 * render, a notice takes the same footprint. A slot too narrow for the flexible
 * widget holds the taller compact one.
 */
function HumanCheck({
  widget: { container, failed, size },
}: Readonly<{ widget: Pick<Turnstile, 'container' | 'failed' | 'size'> }>) {
  return (
    <fieldset className="auth-human-check" data-size={size} aria-label="Verification">
      <div ref={container} />
      {failed ? (
        <p className="flow-meta">Verification could not load. Refresh the page to try again.</p>
      ) : null}
    </fieldset>
  );
}

/**
 * What holds a form's ways in: the published Terms revision for a form that
 * authenticates (`terms` given) and the Turnstile token for one that is
 * challenged (`verification` given). `noticeId` is the agreement line's id;
 * `held` stays true until the revision has loaded and the widget has handed
 * over a token.
 */
function useConsentGate(terms: TermsDecision | undefined, verification: Turnstile | undefined) {
  const noticeId = useId();
  const held =
    (terms !== undefined && !terms.revision) ||
    (verification !== undefined && !verification.solved);
  return { terms, verification, noticeId, held };
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
