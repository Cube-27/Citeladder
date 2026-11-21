import { Link } from 'react-router-dom';
import { type ComponentProps, type ReactNode, useId, useState } from 'react';

import { AuthSwitchLink, AuthSwitchOnly } from '@/components/auth/auth-switch';
import { FlowBlock } from '@/components/templates/flow-page';
import {
  AuthButton,
  AuthDivider,
  AuthForm,
  AuthHumanCheck,
  AuthLegal,
  AuthLinkRow,
} from '@/components/ui/auth-shell';
import { Field } from '@/components/ui/field';
import { GoogleGlyph } from '@/components/ui/google-glyph';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { PasswordField, type PasswordFieldProps } from '@/components/ui/password-field';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { authApi } from '@/lib/api/auth';
import { safeAuthReturnPath } from '@/lib/auth/auth-return-path';
import { ApiError } from '@/lib/api/errors';
import { websiteHref } from '@/lib/config/app-link';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import type { Turnstile } from '@/lib/turnstile/use-turnstile';
import { Notice } from '@/components/ui/notice';

type InputProps = ComponentProps<typeof Input>;

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
          // `username`, not `email`: password managers pair it with the password.
          autoComplete="username"
          spellCheck={false}
          placeholder="Your email address"
        />
      )}
    </Field>
  );
}

/** Account access's password field: the product's field with its reveal control. */
export function AuthPasswordField(props: PasswordFieldProps) {
  return <PasswordField {...props} />;
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
    <AuthLegal id={id}>
      By {signup ? 'creating an account' : 'continuing'}, you agree to the{' '}
      <LegalLink href={websiteHref('/terms')}>Terms of Service</LegalLink> and acknowledge the{' '}
      <LegalLink href={websiteHref('/privacy')}>Privacy Policy</LegalLink>.
    </AuthLegal>
  );
}

function LegalLink({ href, children }: Readonly<{ href: string; children: string }>) {
  return (
    <TextLink asChild tone="muted" text="inherit">
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    </TextLink>
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
  if (err.status === 503) return 'Google sign-in is not available yet. Use email below.';
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
      <AuthButton
        variant="secondary"
        disabled={pending || !revision || unverified}
        aria-describedby={termsNoticeId}
        onClick={() => void start()}
      >
        <Icon icon={GoogleGlyph} />
        <span>{pending ? 'Starting Google sign-in…' : 'Continue with Google'}</span>
      </AuthButton>
      {notice ? <Notice tone="negative">{notice}</Notice> : null}
    </>
  );
}

/**
 * Sign-in, sign-up and the mailbox screens, centred under the logo: the title
 * and line, the form's one alert directly above the first field, the fields,
 * the Turnstile slot (when challenged) and the full-width submit, then the
 * "or" rule and Continue with Google (when the form authenticates), the switch
 * to the other form and the agreement line. An error about one field is that
 * field's own error; the heading also names the document.
 */
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
  showForm = true,
  showFooter = true,
  terms,
  verification,
  children,
}: Readonly<{
  title: string;
  /** A line under the title; sign-in and sign-up have none unless they report something. */
  description?: ReactNode;
  error?: string;
  onSubmit: NonNullable<ComponentProps<'form'>['onSubmit']>;
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  footerPrompt: string;
  footerHref: string;
  footerLabel: string;
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
   * Sign-up, the email-link requests and a challenged sign-in: the Turnstile
   * widget, in a reserved slot between the fields and submit. Submit, and a
   * sign-up's Continue with Google, stay disabled until it hands over a token.
   * Sign-in passes it only once the API has challenged it.
   */
  verification?: Turnstile;
  children: ReactNode;
}>) {
  const consent = useConsentGate(showForm ? terms : undefined, showForm ? verification : undefined);
  const notice = error ? <Notice tone="negative">{error}</Notice> : null;

  // Only sign-in and sign-up switch to each other with motion.
  const switching = showForm && terms !== undefined;

  return (
    <FlowBlock
      title={title}
      sub={description}
      centered
      after={
        <>
          {showFooter ? (
            <p className={textRole('body', 'text-ink-2')}>
              {footerPrompt}{' '}
              <TextLink asChild text="inherit">
                {switching ? (
                  <AuthSwitchLink to={footerHref}>{footerLabel}</AuthSwitchLink>
                ) : (
                  <Link to={footerHref}>{footerLabel}</Link>
                )}
              </TextLink>
            </p>
          ) : null}
          {consent.terms ? (
            <TermsNotice id={consent.noticeId} signup={consent.terms.signup} />
          ) : null}
        </>
      }
    >
      {showForm ? (
        <AuthEmailForm
          consent={consent}
          onSubmit={onSubmit}
          pending={pending}
          submitLabel={submitLabel}
          pendingLabel={pendingLabel}
        >
          {notice}
          {children}
        </AuthEmailForm>
      ) : (
        notice
      )}

      {consent.terms ? (
        <>
          {showForm ? <AuthDivider /> : null}
          <GoogleEntry
            revision={consent.terms.revision}
            signup={consent.terms.signup}
            termsNoticeId={consent.noticeId}
            verification={consent.verification}
          />
        </>
      ) : null}
    </FlowBlock>
  );
}

/**
 * The fields, the Turnstile slot (when challenged) and submit. A held or
 * pending form swallows submit until the gate opens or the attempt ends. The
 * submit is `aria-disabled`, never `disabled`, so it keeps keyboard focus
 * while the attempt is pending (WCAG 2.4.3).
 */
function AuthEmailForm({
  consent,
  onSubmit,
  pending,
  submitLabel,
  pendingLabel,
  children,
}: Readonly<{
  consent: ReturnType<typeof useConsentGate>;
  onSubmit: NonNullable<ComponentProps<'form'>['onSubmit']>;
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  children: ReactNode;
}>) {
  const handleSubmit: NonNullable<ComponentProps<'form'>['onSubmit']> = (event) => {
    if (pending || consent.held) {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  };

  const check = consent.verification ? <AuthHumanCheck widget={consent.verification} /> : null;

  return (
    <AuthForm onSubmit={handleSubmit}>
      {children}

      {/* Sign-up's check is one of its own fields in the switch from sign-in. */}
      {check && consent.terms?.signup ? <AuthSwitchOnly>{check}</AuthSwitchOnly> : check}

      {/* Not `pending`: Button's pending sets `disabled`, which drops focus to
          the document. The changed label says it is working. */}
      <AuthButton
        type="submit"
        variant="primary"
        aria-disabled={pending || consent.held || undefined}
        aria-describedby={consent.terms ? consent.noticeId : undefined}
      >
        {pending ? pendingLabel : submitLabel}
      </AuthButton>
    </AuthForm>
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

/** The links under the sign-in fields: recovery and a new verification email. */
export function AuthRecoveryLinks({
  links,
}: Readonly<{ links: readonly { href: string; label: string }[] }>) {
  return (
    <AuthLinkRow>
      {links.map((link) => (
        <TextLink key={link.href} asChild tone="muted" text="inherit">
          <Link to={link.href}>{link.label}</Link>
        </TextLink>
      ))}
    </AuthLinkRow>
  );
}
