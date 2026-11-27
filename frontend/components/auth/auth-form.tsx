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
import { BrandMark } from '@/components/ui/brand-mark';
import { Input } from '@/components/ui/input';
import { PasswordField, type PasswordFieldProps } from '@/components/ui/password-field';
import { TextLink } from '@/components/ui/text-link';
import { Text } from '@/components/ui/typography';
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
          autoComplete="username"
          spellCheck={false}
          placeholder="Your email address"
        />
      )}
    </Field>
  );
}

export function AuthPasswordField(props: PasswordFieldProps) {
  return <PasswordField {...props} />;
}

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

type TermsDecision = { revision: string | undefined; signup: boolean };

function googleStartInput(
  termsRevision: string,
  verification: Turnstile | undefined,
): Parameters<typeof authApi.oauthStart>[1] {
  const returnTo = safeAuthReturnPath(new URLSearchParams(window.location.search).get('return_to'));
  return verification
    ? { returnTo, termsRevision, signup: true, turnstileToken: verification.token() }
    : { returnTo, termsRevision, signup: false };
}

function googleStartNotice(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Unable to start Google sign-in. Please try email below.';
  if (err.code?.startsWith('human_verification_')) return err.message;
  if (err.status === 503) return 'Google sign-in is not available yet. Use email below.';
  return 'Unable to start Google sign-in. Please try email below.';
}

function GoogleEntry({
  revision,
  signup,
  termsNoticeId,
  verification,
}: Readonly<{
  revision: string | undefined;
  signup: boolean;
  termsNoticeId: string;
  verification: Turnstile | undefined;
}>) {
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const unverified = signup && !verification?.solved;

  async function start() {
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
      setPending(false);
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
        <BrandMark kind="glyph" glyph="google" placement="text" />
        <span>{pending ? 'Starting Google sign-in…' : 'Continue with Google'}</span>
      </AuthButton>
      {notice ? <Notice tone="negative">{notice}</Notice> : null}
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
  showForm = true,
  showFooter = true,
  terms,
  verification,
  children,
}: Readonly<{
  title: string;
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
  terms?: TermsDecision;
  verification?: Turnstile;
  children: ReactNode;
}>) {
  const consent = useConsentGate(showForm ? terms : undefined, showForm ? verification : undefined);
  const notice = error ? <Notice tone="negative">{error}</Notice> : null;

  const switching = showForm && terms !== undefined;

  return (
    <FlowBlock
      title={title}
      sub={description}
      centered
      after={
        <>
          {showFooter ? (
            <Text as="p" variant="body" tone="ink-2">
              {footerPrompt}{' '}
              <TextLink asChild text="inherit">
                {switching ? (
                  <AuthSwitchLink to={footerHref}>{footerLabel}</AuthSwitchLink>
                ) : (
                  <Link to={footerHref}>{footerLabel}</Link>
                )}
              </TextLink>
            </Text>
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

      {check && consent.terms?.signup ? <AuthSwitchOnly>{check}</AuthSwitchOnly> : check}

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

function useConsentGate(terms: TermsDecision | undefined, verification: Turnstile | undefined) {
  const noticeId = useId();
  const held =
    (terms !== undefined && !terms.revision) ||
    (verification !== undefined && !verification.solved);
  return { terms, verification, noticeId, held };
}

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
