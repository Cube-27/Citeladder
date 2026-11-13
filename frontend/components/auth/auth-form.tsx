import { Link } from 'react-router-dom';
import { type ComponentProps, type ReactNode, useId, useState } from 'react';

import {
  AuthButton,
  AuthSignInCard,
  AuthDivider,
  AuthForm,
  AuthHumanCheck,
  AuthLegal,
  AuthLinkRow,
} from '@/components/ui/auth-shell';
import { Callout } from '@/components/ui/callout';
import { Field } from '@/components/ui/field';
import { type BrandGlyph, Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { PasswordField, type PasswordFieldProps } from '@/components/ui/password-field';
import { TextLink } from '@/components/ui/text-link';
import { authApi } from '@/lib/api/auth';
import { safeAuthReturnPath } from '@/lib/auth/auth-return-path';
import { ApiError } from '@/lib/api/errors';
import { websiteHref } from '@/lib/config/app-link';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import type { Turnstile } from '@/lib/turnstile/use-turnstile';

type InputProps = ComponentProps<typeof Input>;

/** The Google "G" in Google's own four colours, a brand glyph `Icon` sizes. */
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
      <AuthButton
        variant="secondary"
        disabled={pending || !revision || unverified}
        aria-describedby={termsNoticeId}
        onClick={() => void start()}
      >
        <Icon icon={GoogleGlyph} />
        <span>{pending ? 'Starting Google sign-in…' : 'Continue with Google'}</span>
      </AuthButton>
      {notice ? <Callout tone="negative">{notice}</Callout> : null}
    </>
  );
}

/**
 * Sign-in, sign-up and the mailbox screens on the AuthSignInCard: the title and
 * line, the form's one alert, Continue with Google and the "or" rule (when the
 * form authenticates), the fields, the Turnstile slot (when challenged) and
 * the submit, the agreement line, and the switch under the card.
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
  description?: string;
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

  return (
    <AuthSignInCard
      title={title}
      sub={description}
      after={
        showFooter ? (
          <>
            {footerPrompt}{' '}
            <TextLink asChild text="inherit">
              <Link to={footerHref}>{footerLabel}</Link>
            </TextLink>
          </>
        ) : undefined
      }
    >
      {error ? <Callout tone="negative">{error}</Callout> : null}

      {consent.terms ? (
        <>
          <GoogleEntry
            revision={consent.terms.revision}
            signup={consent.terms.signup}
            termsNoticeId={consent.noticeId}
            verification={consent.verification}
          />
          {showForm ? <AuthDivider /> : null}
        </>
      ) : null}

      {showForm ? (
        <AuthEmailForm
          consent={consent}
          onSubmit={onSubmit}
          pending={pending}
          submitLabel={submitLabel}
          pendingLabel={pendingLabel}
        >
          {children}
        </AuthEmailForm>
      ) : null}

      {consent.terms ? <TermsNotice id={consent.noticeId} signup={consent.terms.signup} /> : null}
    </AuthSignInCard>
  );
}

/**
 * The fields, the Turnstile slot (when challenged) and submit. A held form
 * swallows submit (Enter in a field) until the gate opens.
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
    if (consent.held) {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  };

  return (
    <AuthForm onSubmit={handleSubmit}>
      {children}

      {consent.verification ? <AuthHumanCheck widget={consent.verification} /> : null}

      <AuthButton
        type="submit"
        variant="primary"
        disabled={pending || consent.held}
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
