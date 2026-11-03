'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AuthEmailField, AuthFormShell, AuthPasswordField } from '@/components/auth/auth-form';
import { Inline } from '@/components/ui/layout';
import { authApi } from '@/lib/api/auth';
import {
  authErrorMessage,
  loginFormSchema,
  oauthSignInErrorMessage,
  type LoginFormValues,
} from '@/lib/auth/forms';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';
import { usePublishedTerms } from '@/lib/auth/terms-consent';
import { Link } from 'react-router-dom';
import { useAuthMutation } from '@/lib/auth/use-auth-mutation';

type SearchParams = Pick<URLSearchParams, 'get'>;

export function LoginScreen({
  demoMode,
  signupOpen,
  searchParams,
}: Readonly<{
  demoMode: boolean;
  /** Self-serve sign-up, including Google, whose first sign-in creates an account. */
  signupOpen: boolean;
  searchParams: SearchParams;
}>) {
  const returnTo = safeAuthReturnPath(searchParams.get('return_to'));
  const description =
    searchParams.get('registered') === '1'
      ? 'Check your email to verify your account. Your trial starts when you set up your workspace.'
      : undefined;
  // The Google callback is a full-page navigation, so it reports failure as a
  // coded query parameter rather than a response body.
  const oauthError = oauthSignInErrorMessage(searchParams.get('error'));
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });
  const terms = usePublishedTerms();
  const { mutation, submit } = useAuthMutation(
    (values: LoginFormValues & { termsRevision: string }) =>
      authApi.login(values).catch(terms.refreshOnRevisionChange),
    returnTo,
  );
  const signIn = (values: LoginFormValues) =>
    terms.revision ? submit({ ...values, termsRevision: terms.revision }) : undefined;
  const failure = mutation.isError ? mutation.error : terms.error;

  return (
    <AuthFormShell
      title="Welcome back"
      description={description}
      error={failure ? authErrorMessage(failure) : oauthError}
      onSubmit={handleSubmit(signIn)}
      pending={isSubmitting || mutation.isPending}
      submitLabel="Continue"
      pendingLabel="Signing in…"
      footerPrompt="Don't have an account?"
      // An MCP handoff that needs an account must survive the detour through
      // registration, so the validated resume path travels with the link.
      footerHref={withAuthReturnPath('/register', returnTo)}
      footerLabel="Sign up"
      footerLinkVariant="emphasis"
      // Signing in records the Terms decision with the account, so no screen
      // after sign-in asks again. Google from here never creates an account:
      // an unknown address is sent to sign up.
      terms={{ revision: terms.revision, signup: false }}
      showFooter={!demoMode && signupOpen}
    >
      <AuthEmailField error={errors.email?.message} inputProps={register('email')} />
      <AuthPasswordField
        label="Password"
        error={errors.password?.message}
        inputProps={register('password')}
        autoComplete="current-password"
        placeholder="••••••••"
      />
      <Inline gap="meta" className="auth-recovery-links justify-between">
        <Link to={withAuthReturnPath('/forgot-password', returnTo)}>Forgot password?</Link>
        <Link to={withAuthReturnPath('/resend-verification', returnTo)}>
          Resend verification email
        </Link>
      </Inline>
    </AuthFormShell>
  );
}
