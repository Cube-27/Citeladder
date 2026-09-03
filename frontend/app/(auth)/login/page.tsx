'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { AuthEmailField, AuthFormShell, AuthPasswordField } from '@/components/auth/auth-form';
import { authApi } from '@/lib/api/auth';
import { authErrorMessage, loginFormSchema, type LoginFormValues } from '@/lib/auth/forms';
import { safeMcpReturnPath, withMcpReturnPath } from '@/lib/auth/mcp-return-path';
import { useAuthMutation } from '@/lib/auth/use-auth-mutation';

function LoginForm() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const searchParams = useSearchParams();
  const returnTo = safeMcpReturnPath(searchParams.get('return_to'));
  const description =
    searchParams.get('registered') === '1'
      ? 'Your account is ready. Sign in to continue.'
      : 'Welcome back! Please sign in to continue.';
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
      error={mutation.isError ? authErrorMessage(mutation.error) : undefined}
      onSubmit={handleSubmit(submit)}
      pending={isSubmitting || mutation.isPending}
      submitLabel="Continue"
      pendingLabel="Signing in…"
      footerPrompt="Don't have an account?"
      // An MCP handoff that needs an account must survive the detour through
      // registration, so the validated resume path travels with the link.
      footerHref={withMcpReturnPath('/register', returnTo)}
      footerLabel="Sign up"
      showFooter={!demoMode}
    >
      <AuthEmailField error={errors.email?.message} inputProps={register('email')} />
      <AuthPasswordField
        label="Password"
        error={errors.password?.message}
        inputProps={register('password')}
        autoComplete="current-password"
        placeholder="••••••••"
      />
    </AuthFormShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
