'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';

import { AuthEmailField, AuthFormShell, AuthPasswordField } from '@/components/auth/auth-form';
import { authApi } from '@/lib/api/auth';
import { authErrorMessage, registerFormSchema, type RegisterFormValues } from '@/lib/auth/forms';
import { safeMcpReturnPath, withMcpReturnPath } from '@/lib/auth/mcp-return-path';

function RegisterForm() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const router = useRouter();
  const searchParams = useSearchParams();
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
    onSuccess: () => router.replace(withMcpReturnPath('/login?registered=1', returnTo)),
  });
  const submit = (values: RegisterFormValues) =>
    mutation.mutateAsync(values).catch(() => undefined);

  if (demoMode) {
    return (
      <AuthFormShell
        title="Registration unavailable"
        description="This temporary demo uses a preconfigured account."
        onSubmit={(event) => event.preventDefault()}
        pending={false}
        submitLabel="Registration disabled"
        pendingLabel="Registration disabled"
        footerPrompt="Already have the demo account?"
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

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
