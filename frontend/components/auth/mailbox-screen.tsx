import { useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AuthRouteShell } from './auth-route-shell';
import { AuthEmailField, AuthFormShell, AuthPasswordField, AuthRecoveryLinks } from './auth-form';
import { authApi } from '@/lib/api/auth';
import { authFormPolicy, passwordHint } from '@/lib/config/auth';
import { authErrorMessage } from '@/lib/auth/forms';
import { routePath } from '@/lib/navigation/route-path';
import { useUrlParam } from '@/lib/navigation/url-params';
import { isOneOf } from '@/lib/utils';
import { useTurnstile } from '@/lib/turnstile/use-turnstile';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';

const MAILBOX_OPERATIONS = [
  'verify-email',
  'reset-password',
  'forgot-password',
  'resend-verification',
] as const;
type MailboxOperation = (typeof MAILBOX_OPERATIONS)[number];

function mailboxOperation(pathname: string): MailboxOperation {
  const path = routePath(pathname).slice(1);
  return isOneOf(MAILBOX_OPERATIONS, path) ? path : 'forgot-password';
}

const MAILBOX_TITLES: Record<MailboxOperation, string> = {
  'verify-email': 'Verify your email',
  'resend-verification': 'Resend verification email',
  'reset-password': 'Reset your password',
  'forgot-password': 'Reset your password',
};

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
  const queryReturnTo = useUrlParam('return_to');
  const operation = mailboxOperation(location.pathname);
  const confirmation = operation === 'verify-email' || operation === 'reset-password';
  const [secrets] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    return {
      token: fragment.get('token') ?? '',
      returnTo: safeAuthReturnPath(fragment.get('return_to') ?? queryReturnTo),
    };
  });
  useLayoutEffect(() => {
    if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const verification = useTurnstile(operation);
  const mutation = useMutation({
    mutationFn: () =>
      authApi.mailbox(
        operation,
        confirmation
          ? { token: secrets.token, password }
          : {
              email,
              return_to: secrets.returnTo ?? '',
              turnstile_token: verification.token(),
            },
      ),
    onSettled: () => {
      if (!confirmation) verification.reset();
    },
  });
  const title = MAILBOX_TITLES[operation];
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
        showForm={!mutation.isSuccess && !incomplete}
        error={
          mutation.isError
            ? authErrorMessage(
                mutation.error,
                confirmation
                  ? "Couldn't confirm the link. Try again."
                  : "Couldn't send the email. Try again.",
              )
            : undefined
        }
        verification={confirmation ? undefined : verification}
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
          <AuthRecoveryLinks
            links={[
              {
                href: withAuthReturnPath('/forgot-password', secrets.returnTo),
                label: 'Didn’t sign up or don’t know the password? Reset it.',
              },
            ]}
          />
        )}
      </AuthFormShell>
    </AuthRouteShell>
  );
}

const MAILBOX_DESCRIPTIONS: Record<MailboxOperation, string | null> = {
  'verify-email': null,
  'resend-verification': null,
  'reset-password': 'Password resets sign out all sessions.',
  'forgot-password': 'Password resets sign out all sessions.',
};

function mailboxDescription(operation: MailboxOperation, incomplete: boolean): string | null {
  if (incomplete) return 'This link is incomplete. Request a new one.';
  return MAILBOX_DESCRIPTIONS[operation];
}
