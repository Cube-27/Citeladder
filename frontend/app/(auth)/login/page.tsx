'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/marketing/primitives/button';
import { MktAlert, MktField, MktInput } from '@/components/marketing/primitives/field';
import { authApi } from '@/lib/api/auth';
import { authErrorMessage, loginFormSchema, type LoginFormValues } from '@/lib/auth/forms';
import { useAuthMutation } from '@/lib/auth/use-auth-mutation';

/**
 * Login page. react-hook-form + zod client validation; on success the `me`
 * cache is primed and the user is routed directly to `/onboarding` (no
 * projects yet) or `/visibility` — no marketing-landing bounce. Email is the
 * only sign-in path for now; the OAuth buttons stay in
 * `components/auth/oauth-buttons.tsx` until the backend providers are
 * configured. Any `ApiError` surfaces inline above the form.
 *
 * No card wrapper: on a split screen the form column IS the surface, so
 * boxing the form would put a border around a border.
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
  const pending = isSubmitting || mutation.isPending;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="font-mkt-display text-mkt-d3 text-mkt-ink font-medium">Sign in</h1>
        <p className="text-mkt-body text-mkt-ink-soft">Pick up where your brand left off.</p>
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
              autoComplete="current-password"
              placeholder="••••••••"
            />
          )}
        </MktField>

        <Button type="submit" className="mt-1 w-full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="border-mkt-line text-mkt-sm text-mkt-ink-soft border-t pt-5">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-mkt-proof font-semibold">
          Create one
        </Link>
      </p>
    </div>
  );
}
