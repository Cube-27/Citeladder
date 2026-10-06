'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AuthEmailField, AuthFormShell, AuthPasswordField } from '@/components/auth/auth-form';
import { authApi } from '@/lib/api/auth';
import {
  authErrorMessage,
  loginFormSchema,
  oauthSignInErrorMessage,
  type LoginFormValues,
} from '@/lib/auth/forms';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';
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
      ? 'Check your email to verify your account. Your seven-day trial starts at registration.'
      : 'Welcome back! Please sign in to continue.';
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
  const { mutation, submit } = useAuthMutation(
    (values: LoginFormValues) => authApi.login(values.email, values.password),
    returnTo,
  );

  return (
    <AuthFormShell
      title="Sign in"
      description={description}
      error={mutation.isError ? authErrorMessage(mutation.error) : oauthError}
      onSubmit={handleSubmit(submit)}
      pending={isSubmitting || mutation.isPending}
      submitLabel="Continue"
      pendingLabel="Signing in…"
      footerPrompt="Don't have an account?"
      // An MCP handoff that needs an account must survive the detour through
      // registration, so the validated resume path travels with the link.
      footerHref={withAuthReturnPath('/register', returnTo)}
      footerLabel="Sign up"
      footerLinkVariant="emphasis"
      showOAuth
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
      <Link to={withAuthReturnPath('/forgot-password', returnTo)}>Forgot password?</Link>
      <Link to={withAuthReturnPath('/resend-verification', returnTo)}>
        Resend verification email
      </Link>
    </AuthFormShell>
  );
}
