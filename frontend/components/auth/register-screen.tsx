'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import { AuthEmailField, AuthFormShell, AuthPasswordField } from '@/components/auth/auth-form';
import { authApi } from '@/lib/api/auth';
import { passwordHint } from '@/lib/config/auth';
import { queryKeys } from '@/lib/api/query-keys';
import {
  authErrorMessage,
  oauthSignInErrorMessage,
  registerFormSchema,
  type RegisterFormValues,
} from '@/lib/auth/forms';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';

type SearchParams = Pick<URLSearchParams, 'get'>;

export function RegisterScreen({
  demoMode,
  signupOpen,
  replace,
  searchParams,
}: Readonly<{
  demoMode: boolean;
  /** Self-serve sign-up; when closed, accounts are created by an operator. */
  signupOpen: boolean;
  replace: (href: string) => void;
  searchParams: SearchParams;
}>) {
  // An MCP handoff can land here when the visitor has no account yet. The
  // resume path has to survive registration AND the sign-in that follows it,
  // so it is carried back onto /login rather than consumed here.
  const returnTo = safeAuthReturnPath(searchParams.get('return_to'));
  // Google sign-in found no account: the address arrives here to sign up.
  const oauthNotice = oauthSignInErrorMessage(searchParams.get('error'));
  const terms = useQuery({
    queryKey: queryKeys.auth.policies(),
    queryFn: () => authApi.policies(),
    // The published revision changes only with a deployment.
    staleTime: Number.POSITIVE_INFINITY,
    enabled: !demoMode && signupOpen,
  });
  const termsRevision = terms.data?.terms_revision;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: searchParams.get('email') ?? '', password: '', confirmPassword: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: RegisterFormValues & { termsRevision: string }) =>
      authApi.register({
        email: values.email,
        password: values.password,
        termsRevision: values.termsRevision,
        returnTo,
      }),
    onSuccess: () => replace(withAuthReturnPath('/login?registered=1', returnTo)),
  });
  const submit = (values: RegisterFormValues) =>
    termsRevision
      ? mutation.mutateAsync({ ...values, termsRevision }).catch(() => undefined)
      : undefined;

  if (demoMode || !signupOpen) {
    return (
      <AuthFormShell
        title="Registration unavailable"
        description={
          demoMode
            ? 'This temporary demo uses a preconfigured account.'
            : 'Accounts are set up for you by the CiteLadder team. Book a demo to get access.'
        }
        onSubmit={(event) => event.preventDefault()}
        pending={false}
        submitLabel="Registration disabled"
        pendingLabel="Registration disabled"
        footerPrompt={demoMode ? 'Already have the demo account?' : 'Already have an account?'}
        footerHref={withAuthReturnPath('/login', returnTo)}
        footerLabel="Sign in"
        showOAuth={false}
        showForm={false}
      >
        {null}
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell
      title="Create your account"
      description="Verify your email, then set up your workspace to start your trial. No card required."
      error={registerError(mutation.isError ? mutation.error : null, terms.error, oauthNotice)}
      onSubmit={handleSubmit(submit)}
      pending={isSubmitting || mutation.isPending}
      submitLabel="Create account"
      pendingLabel="Creating account…"
      footerPrompt="Already have an account?"
      footerHref={withAuthReturnPath('/login', returnTo)}
      footerLabel="Sign in"
      signup={{ termsRevision }}
    >
      <AuthEmailField error={errors.email?.message} inputProps={register('email')} />
      <AuthPasswordField
        label="Password"
        error={errors.password?.message}
        inputProps={register('password')}
        autoComplete="new-password"
        placeholder={passwordHint}
      />
      <AuthPasswordField
        label="Confirm password"
        error={errors.confirmPassword?.message}
        inputProps={register('confirmPassword')}
        autoComplete="new-password"
        placeholder="Re-enter your password"
      />
    </AuthFormShell>
  );
}

/** The form's one alert: a refused sign-up, then an unreadable Terms revision, then Google's notice. */
function registerError(
  submitError: unknown,
  termsError: unknown,
  oauthNotice: string | undefined,
): string | undefined {
  const error = submitError ?? termsError;
  return error ? authErrorMessage(error) : oauthNotice;
}
