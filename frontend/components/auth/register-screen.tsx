import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import { AuthEmailField, AuthFormShell, AuthPasswordField } from '@/components/auth/auth-form';
import { AuthSwitchOnly } from '@/components/auth/auth-switch';
import { TextLink } from '@/components/ui/text-link';
import { authApi } from '@/lib/api/auth';
import { websiteHref } from '@/lib/config/app-link';
import { usePublishedTerms } from '@/lib/auth/terms-consent';
import { passwordHint } from '@/lib/config/auth';
import {
  authErrorMessage,
  oauthSignInErrorMessage,
  registerFormSchema,
  signupEmailFieldError,
  type RegisterFormValues,
} from '@/lib/auth/forms';
import { useTurnstile } from '@/lib/turnstile/use-turnstile';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';

type SearchParams = Pick<URLSearchParams, 'get'>;

export function RegisterScreen({
  demoMode,
  signupOpen,
  replace,
  searchParams,
}: Readonly<{
  demoMode: boolean;
  signupOpen: boolean;
  replace: (href: string) => void;
  searchParams: SearchParams;
}>) {
  const returnTo = safeAuthReturnPath(searchParams.get('return_to'));
  const oauthNotice = oauthSignInErrorMessage(searchParams.get('error'));
  const terms = usePublishedTerms(!demoMode && signupOpen);
  const termsRevision = terms.revision;
  const verification = useTurnstile('signup');
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
      authApi
        .register({
          email: values.email,
          password: values.password,
          termsRevision: values.termsRevision,
          turnstileToken: verification.token(),
          returnTo,
        })
        .catch(terms.refreshOnRevisionChange),
    onSuccess: () => replace(withAuthReturnPath('/login?registered=1', returnTo)),
    onSettled: () => verification.reset(),
  });
  const emailRefusal = mutation.isError ? signupEmailFieldError(mutation.error) : undefined;
  const submit = (values: RegisterFormValues) =>
    termsRevision
      ? mutation.mutateAsync({ ...values, termsRevision }).catch(() => undefined)
      : undefined;

  if (demoMode || !signupOpen) {
    return (
      <AuthFormShell
        title="Registration unavailable"
        description={
          demoMode ? undefined : (
            <>
              <TextLink asChild text="inherit">
                <a href={websiteHref('/contact')}>Book a demo</a>
              </TextLink>{' '}
              to get access.
            </>
          )
        }
        onSubmit={(event) => event.preventDefault()}
        pending={false}
        submitLabel="Registration disabled"
        pendingLabel="Registration disabled"
        footerPrompt={demoMode ? 'Already have the demo account?' : 'Already have an account?'}
        footerHref={withAuthReturnPath('/login', returnTo)}
        footerLabel="Sign in"
        showForm={false}
      >
        {null}
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell
      title="Sign up"
      error={registerError(
        mutation.isError && !emailRefusal ? mutation.error : null,
        terms.error,
        oauthNotice,
      )}
      onSubmit={handleSubmit(submit)}
      pending={isSubmitting || mutation.isPending}
      submitLabel="Create account"
      pendingLabel="Creating account…"
      footerPrompt="Already have an account?"
      footerHref={withAuthReturnPath('/login', returnTo)}
      footerLabel="Sign in"
      terms={{ revision: termsRevision, signup: true }}
      verification={verification}
    >
      <AuthEmailField
        error={errors.email?.message ?? emailRefusal}
        inputProps={register('email')}
      />
      <AuthPasswordField
        label="Password"
        error={errors.password?.message}
        inputProps={register('password')}
        autoComplete="new-password"
        placeholder={passwordHint}
      />
      <AuthSwitchOnly>
        <AuthPasswordField
          label="Confirm password"
          error={errors.confirmPassword?.message}
          inputProps={register('confirmPassword')}
          autoComplete="new-password"
          placeholder="Re-enter your password"
        />
      </AuthSwitchOnly>
    </AuthFormShell>
  );
}

function registerError(
  submitError: unknown,
  termsError: unknown,
  oauthNotice: string | undefined,
): string | undefined {
  const error = submitError ?? termsError;
  return error ? authErrorMessage(error, "Couldn't create your account. Try again.") : oauthNotice;
}
