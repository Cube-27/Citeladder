'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/marketing/primitives/button';
import { MktAlert, MktField, MktInput } from '@/components/marketing/primitives/field';
import { authApi } from '@/lib/api/auth';
import { authErrorMessage, loginFormSchema, type LoginFormValues } from '@/lib/auth/forms';
import { useAuthMutation } from '@/lib/auth/use-auth-mutation';

/**
 * Login page. react-hook-form + zod client validation; on success the `me`
 * cache is primed and the user is routed directly to `/onboarding` (no
 * projects yet) or `/projects`. Email is the only sign-in path.
 */
export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="relative">
      <div className="shadow-card relative rounded-2xl border border-slate-200 bg-white p-8 sm:p-10">
        <div className="mb-8 space-y-2 text-center sm:text-left">
          <div className="mb-2 inline-flex size-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
            <Lock className="size-5" />
          </div>
          <h1 className="font-mkt-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Sign in
          </h1>
          <p className="text-sm text-slate-500">Pick up where your brand left off.</p>
        </div>

        {mutation.isError ? (
          <div className="mb-6">
            <MktAlert>{authErrorMessage(mutation.error)}</MktAlert>
          </div>
        ) : null}

        <form noValidate onSubmit={onSubmit} className="grid gap-5">
          <MktField label="Email" required error={errors.email?.message}>
            {(props) => (
              <div className="relative">
                <MktInput
                  {...props}
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="border-slate-200 bg-slate-50/80 pl-10 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-indigo-500/20"
                />
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              </div>
            )}
          </MktField>

          <MktField label="Password" required error={errors.password?.message}>
            {(props) => (
              <div className="relative">
                <MktInput
                  {...props}
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="border-slate-200 bg-slate-50/80 pr-10 pl-10 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-indigo-500/20"
                />
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-slate-400 transition-colors hover:text-slate-600"
                  aria-label={showPassword ? 'Hide value' : 'Show value'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            )}
          </MktField>

          <Button type="submit" className="mt-2 w-full font-semibold" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {/* Footer link - No separating line */}
        <p className="mt-8 text-center text-sm font-medium text-slate-600">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
