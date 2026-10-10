import { useLayoutEffect, useState } from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AuthRouteShell } from './auth-route-shell';
import { AuthEmailField, AuthFormShell, AuthPasswordField } from './auth-form';
import { authApi } from '@/lib/api/auth';
import { authFormPolicy, passwordHint } from '@/lib/config/auth';
import { authErrorMessage } from '@/lib/auth/forms';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';

type MailboxOperation =
  | 'verify-email'
  | 'reset-password'
  | 'forgot-password'
  | 'resend-verification';

const MAILBOX_TITLES: Record<MailboxOperation, string> = {
  'verify-email': 'Verify your email',
  'resend-verification': 'Resend verification email',
  'reset-password': 'Reset your password',
  'forgot-password': 'Reset your password',
};

/** Back to sign-in, or, for a link missing its token, to requesting a new one. */
function mailboxFooter(operation: MailboxOperation, incomplete: boolean, returnTo?: string) {
  if (!incomplete)
    return {
      footerPrompt: 'Ready to continue?',
      footerHref: withAuthReturnPath('/login', returnTo),
      footerLabel: 'Sign in',
    };
  const path = operation === 'verify-email' ? '/resend-verification' : '/forgot-password';
  return {
    footerPrompt: 'Need a new link?',
    footerHref: withAuthReturnPath(path, returnTo),
    footerLabel: 'Request one',
  };
}

export default function MailboxScreen() {
  const location = useLocation();
  const [search] = useSearchParams();
  const operation = location.pathname
    .replace(/\/+$/u, '')
    .slice(1)
    .toLowerCase() as MailboxOperation;
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
  const title = MAILBOX_TITLES[operation];
  // A link opened without its token (cut short by a mail client, say) cannot
  // confirm anything; asking for a password would only fail.
  const incomplete = confirmation && !secrets.token;
  const description = mutation.isSuccess
    ? mutation.data.message
    : mailboxDescription(operation, incomplete);
  return (
    <AuthRouteShell>
      <AuthFormShell
        title={title}
        description={description}
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
        pending={mutation.isPending}
        submitLabel={confirmation ? 'Confirm' : 'Request email'}
        pendingLabel="Working…"
        {...mailboxFooter(operation, incomplete, secrets.returnTo)}
        showOAuth={false}
        requireTerms={false}
        showForm={!mutation.isSuccess && !incomplete}
        error={mutation.isError ? authErrorMessage(mutation.error) : undefined}
      >
        {confirmation ? (
          <AuthPasswordField
            label={operation === 'verify-email' ? 'Signup password' : 'New password'}
            autoComplete={operation === 'verify-email' ? 'current-password' : 'new-password'}
            placeholder={passwordHint}
            inputProps={{
              value: password,
              onChange: (event) => setPassword(event.target.value),
              minLength: authFormPolicy.passwordMinLength,
              maxLength: authFormPolicy.passwordMaxLength,
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

const MAILBOX_DESCRIPTIONS: Record<MailboxOperation, string> = {
  'verify-email':
    'Enter the password you chose at signup to confirm. Your trial starts when you set up your workspace.',
  'resend-verification':
    'Enter the email you signed up with and we’ll send a new verification link.',
  'reset-password': 'Use your email to secure your account. Password resets sign out all sessions.',
  'forgot-password':
    'Use your email to secure your account. Password resets sign out all sessions.',
};

function mailboxDescription(operation: MailboxOperation, incomplete: boolean): string {
  if (incomplete)
    return 'This link is incomplete. Open the whole link from your email, or request a new one.';
  return MAILBOX_DESCRIPTIONS[operation];
}
