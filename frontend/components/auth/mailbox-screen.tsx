import { useLayoutEffect, useState } from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AuthRouteShell } from './auth-route-shell';
import { AuthEmailField, AuthFormShell, AuthPasswordField } from './auth-form';
import { authApi } from '@/lib/api/auth';
import { authErrorMessage } from '@/lib/auth/forms';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';

export default function MailboxScreen() {
  const location = useLocation();
  const [search] = useSearchParams();
  const operation = location.pathname.slice(1) as
    | 'verify-email'
    | 'reset-password'
    | 'forgot-password'
    | 'resend-verification';
  const confirmation = operation === 'verify-email' || operation === 'reset-password';
  const [secrets] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    // Read only during initialization: StrictMode invokes this initializer twice.
    return {
      token: fragment.get('token') ?? '',
      returnTo: safeAuthReturnPath(fragment.get('return_to') ?? search.get('return_to')),
    };
  });
  useLayoutEffect(() => {
    // Remove the fragment before paint, after both StrictMode initializations.
    if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      authApi.mailbox(
        operation,
        confirmation
          ? { token: secrets.token, password }
          : { email, return_to: secrets.returnTo ?? '' },
      ),
  });
  const title =
    operation === 'verify-email'
      ? 'Verify your email'
      : operation === 'resend-verification'
        ? 'Resend verification email'
        : 'Reset your password';
  return (
    <AuthRouteShell>
      <AuthFormShell
        title={title}
        description={
          mutation.isSuccess
            ? mutation.data.message
            : operation === 'verify-email'
              ? 'Enter the password you chose at signup to confirm. Your trial starts at registration.'
              : 'Use your email to secure your account. Password resets sign out all sessions.'
        }
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
        pending={mutation.isPending}
        submitLabel={confirmation ? 'Confirm' : 'Request email'}
        pendingLabel="Working…"
        footerPrompt="Ready to continue?"
        footerHref={withAuthReturnPath('/login', secrets.returnTo)}
        footerLabel="Sign in"
        showOAuth={false}
        requireTerms={false}
        showForm={!mutation.isSuccess}
        error={mutation.isError ? authErrorMessage(mutation.error) : undefined}
      >
        {confirmation ? (
          <AuthPasswordField
            label={operation === 'verify-email' ? 'Signup password' : 'New password'}
            autoComplete={operation === 'verify-email' ? 'current-password' : 'new-password'}
            placeholder="At least 8 characters"
            inputProps={{
              value: password,
              onChange: (event) => setPassword(event.target.value),
              minLength: 8,
              maxLength: 128,
              required: true,
            }}
          />
        ) : (
          <AuthEmailField
            inputProps={{
              value: email,
              onChange: (event) => setEmail(event.target.value),
              required: true,
            }}
          />
        )}
        {operation === 'verify-email' && (
          <Link to={withAuthReturnPath('/forgot-password', secrets.returnTo)}>
            Didn’t sign up or don’t know the password? Reset it.
          </Link>
        )}
      </AuthFormShell>
    </AuthRouteShell>
  );
}
