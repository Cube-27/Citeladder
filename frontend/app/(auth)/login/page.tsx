'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api/auth';
import { authErrorMessage, loginFormSchema, type LoginFormValues } from '@/lib/auth/forms';
import { useAuthMutation } from '@/lib/auth/use-auth-mutation';

/**
 * Login page (F4). react-hook-form + zod client validation; on success the
 * `me` cache is primed and the user is routed directly to `/onboarding` (no
 * projects yet) or `/visibility` — no marketing-landing bounce. Email is the
 * only sign-in path for now; the OAuth buttons stay in
 * `components/auth/oauth-buttons.tsx` until the backend providers are
 * configured. Any `ApiError` surfaces inline in a danger alert above the form.
 */
export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const { mutation, submit } = useAuthMutation((values: LoginFormValues) =>
    authApi.login(values.email, values.password),
  );

  const onSubmit = handleSubmit(submit);

  return (
    <div className="grid gap-6">
      {/* The card wrapper is gone. On a split screen the form column IS the
          surface — boxing it inside a panel put a border around a border and
          shrank the fields for no reason. */}
      <h1 className="text-foreground text-2xl font-semibold tracking-[-0.02em]">Sign in</h1>

      {mutation.isError ? <Alert tone="danger">{authErrorMessage(mutation.error)}</Alert> : null}

      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <Field label="Email" required error={errors.email?.message}>
          {(props) => (
            <Input
              {...props}
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
            />
          )}
        </Field>

        <Field label="Password" required error={errors.password?.message}>
          {(props) => (
            <Input
              {...props}
              {...register('password')}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
            />
          )}
        </Field>

        <Button
          type="submit"
          size="lg"
          className="mt-1 w-full"
          disabled={isSubmitting || mutation.isPending}
        >
          {isSubmitting || mutation.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="border-border-subtle text-secondary border-t pt-5 text-sm">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="focus-ring text-accent-text rounded-sm font-medium">
          Create one
        </Link>
      </p>
    </div>
  );
}
