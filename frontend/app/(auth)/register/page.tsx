'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/marketing/primitives/button';
import { MktAlert, MktField, MktInput } from '@/components/marketing/primitives/field';
import { authApi } from '@/lib/api/auth';
import { authErrorMessage, registerFormSchema, type RegisterFormValues } from '@/lib/auth/forms';
import { useAuthMutation } from '@/lib/auth/use-auth-mutation';

/**
 * Register page. Mirrors the login page: react-hook-form + zod client
 * validation (with a confirm-password match rule), inline `ApiError`, and — on
 * success — priming the `me` cache and routing straight to `/onboarding` (no
 * projects yet) or `/visibility`. Email is the only sign-up path for now; the
 * OAuth buttons stay in `components/auth/oauth-buttons.tsx` until the backend
 * providers are configured.
 */
export default function RegisterPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const { mutation, submit } = useAuthMutation((values: RegisterFormValues) =>
    authApi.register(values.email, values.password),
  );

  const onSubmit = handleSubmit(submit);
  const pending = isSubmitting || mutation.isPending;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="font-mkt-display text-mkt-d3 text-mkt-ink font-medium">
          Create your account
        </h1>
        <p className="text-mkt-body text-mkt-ink-soft">
          Start measuring how AI answers describe your brand.
        </p>
      </div>

      {mutation.isError ? <MktAlert>{authErrorMessage(mutation.error)}</MktAlert> : null}

      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <MktField label="Email" required error={errors.email?.message}>
          {(props) => (
            <MktInput
              {...props}
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
            />
          )}
        </MktField>

        <MktField label="Password" required error={errors.password?.message}>
          {(props) => (
            <MktInput
              {...props}
              {...register('password')}
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          )}
        </MktField>

        <MktField label="Confirm password" required error={errors.confirmPassword?.message}>
          {(props) => (
            <MktInput
              {...props}
              {...register('confirmPassword')}
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
            />
          )}
        </MktField>

        <Button type="submit" className="mt-1 w-full" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="border-mkt-line text-mkt-sm text-mkt-ink-soft border-t pt-5">
        Already have an account?{' '}
        <Link href="/login" className="text-mkt-proof font-semibold">
          Sign in
        </Link>
      </p>
    </div>
  );
}
