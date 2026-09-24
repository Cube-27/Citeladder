'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import { AuthEmailField, AuthFormShell, AuthPasswordField } from '@/components/auth/auth-form';
import { authApi } from '@/lib/api/auth';
import { authErrorMessage, registerFormSchema, type RegisterFormValues } from '@/lib/auth/forms';
import { safeMcpReturnPath, withMcpReturnPath } from '@/lib/auth/mcp-return-path';

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
  const returnTo = safeMcpReturnPath(searchParams.get('return_to'));
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: RegisterFormValues) => authApi.register(values.email, values.password),
    onSuccess: () => replace(withMcpReturnPath('/login?registered=1', returnTo)),
  });
  const submit = (values: RegisterFormValues) =>
    mutation.mutateAsync(values).catch(() => undefined);

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
        footerHref={withMcpReturnPath('/login', returnTo)}
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
      description="Start measuring how AI answers describe your brand."
      error={mutation.isError ? authErrorMessage(mutation.error) : undefined}
      onSubmit={handleSubmit(submit)}
      pending={isSubmitting || mutation.isPending}
      submitLabel="Create account"
      pendingLabel="Creating account…"
      footerPrompt="Already have an account?"
      footerHref={withMcpReturnPath('/login', returnTo)}
      footerLabel="Sign in"
    >
      <AuthEmailField error={errors.email?.message} inputProps={register('email')} />
      <AuthPasswordField
        label="Password"
        error={errors.password?.message}
        inputProps={register('password')}
        autoComplete="new-password"
        placeholder="At least 8 characters"
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
