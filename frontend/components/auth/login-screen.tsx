import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  AuthEmailField,
  AuthFormShell,
  AuthPasswordField,
  AuthRecoveryLinks,
} from '@/components/auth/auth-form';
import { AuthSwitchOnly } from '@/components/auth/auth-switch';
import { Stack } from '@/components/ui/layout';
import { authApi } from '@/lib/api/auth';
import {
  authErrorMessage,
  loginFormSchema,
  oauthSignInErrorMessage,
  type LoginFormValues,
} from '@/lib/auth/forms';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';
import { usePublishedTerms } from '@/lib/auth/terms-consent';
import { useAuthMutation } from '@/lib/auth/use-auth-mutation';
import { ApiError } from '@/lib/api/errors';
import { useTurnstile } from '@/lib/turnstile/use-turnstile';

type SearchParams = Pick<URLSearchParams, 'get'>;

/** The refusal that tells an unchallenged sign-in to solve the check first. */
const CHALLENGE_CODE = 'human_verification_failed';

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
    searchParams.get('registered') === '1' ? 'Check your email to verify your account.' : undefined;
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
  const terms = usePublishedTerms();
  const verification = useTurnstile('login');
  // Sign-in is challenged only after repeated failures: the API refuses an
  // unchallenged attempt with `human_verification_failed`, and from then on
  // this form shows the widget and sends its token.
  const [challenged, setChallenged] = useState(false);
  const { mutation, submit } = useAuthMutation(
    (values: LoginFormValues & { termsRevision: string; turnstileToken?: string }) =>
      authApi
        .login(values)
        .catch(terms.refreshOnRevisionChange)
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.code === CHALLENGE_CODE) setChallenged(true);
          throw error;
        }),
    returnTo,
  );
  const signIn = async (values: LoginFormValues) => {
    if (!terms.revision) return;
    if (!challenged) return submit({ ...values, termsRevision: terms.revision });
    await submit({
      ...values,
      termsRevision: terms.revision,
      turnstileToken: verification.token(),
    });
    // The token is single-use, spent or not: a retry solves a fresh one.
    verification.reset();
  };
  const failure = mutation.isError ? mutation.error : terms.error;
  // Refused credentials are about the password field: the message is that
  // field's own error, under it, not a form alert above the form.
  const refused = mutation.error instanceof ApiError && mutation.error.status === 401;
  const formError = failure && !refused ? authErrorMessage(failure) : oauthError;
  const passwordError =
    errors.password?.message ?? (refused ? authErrorMessage(mutation.error) : undefined);

  return (
    <AuthFormShell
      title="Welcome back"
      description={description}
      error={formError}
      onSubmit={handleSubmit(signIn)}
      pending={isSubmitting || mutation.isPending}
      submitLabel="Continue"
      pendingLabel="Signing in…"
      footerPrompt="Don't have an account?"
      // An MCP handoff that needs an account must survive the detour through
      // registration, so the validated resume path travels with the link.
      footerHref={withAuthReturnPath('/register', returnTo)}
      footerLabel="Sign up"
      // Signing in records the Terms decision with the account, so no screen
      // after sign-in asks again. Google from here never creates an account:
      // an unknown address is sent to sign up.
      terms={{ revision: terms.revision, signup: false }}
      verification={challenged ? verification : undefined}
      showFooter={!demoMode && signupOpen}
    >
      <AuthEmailField error={errors.email?.message} inputProps={register('email')} />
      {/* The recovery links belong to the password: 4 under it, 16 above submit. */}
      <Stack gap="tight">
        <AuthPasswordField
          label="Password"
          error={passwordError}
          inputProps={register('password')}
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <AuthSwitchOnly>
          <AuthRecoveryLinks
            links={[
              { href: withAuthReturnPath('/forgot-password', returnTo), label: 'Forgot password?' },
              {
                href: withAuthReturnPath('/resend-verification', returnTo),
                label: 'Resend verification email',
              },
            ]}
          />
        </AuthSwitchOnly>
      </Stack>
    </AuthFormShell>
  );
}
