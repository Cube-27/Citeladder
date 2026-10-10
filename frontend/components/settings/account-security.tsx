import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api/auth';
import { authFormPolicy, passwordHint } from '@/lib/config/auth';
import { authErrorMessage } from '@/lib/auth/forms';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { clearAccountScopedClientState } from '@/lib/auth/account-transition';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { AuthPasswordField } from '@/components/auth/auth-form';
import { Stack } from '@/components/ui/layout';
import { EditorialSectionHeader } from '@/components/ui/workspace';

function SecurityIdentity({
  data,
}: Readonly<{ data: Awaited<ReturnType<typeof authApi.security>> | undefined }>) {
  if (!data) return null;
  return (
    <p className="type-body">
      Sign-in methods: {data.methods.join(', ')}. Email:{' '}
      {data.email_verified ? 'Verified' : 'Legacy or operator access; no verification recorded'}.
    </p>
  );
}

export default function AccountSecurity({
  showHeading = true,
}: Readonly<{ showHeading?: boolean }>) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(false);
  const client = useQueryClient();
  const security = useQuery({
    queryKey: ['auth', 'security'],
    queryFn: authApi.security,
  });
  const mutation = useMutation({
    // Both end every session, this device's included (a sign-out is always everywhere).
    mutationFn: async (operation: 'change-password' | 'sign-out') => {
      if (operation === 'sign-out') return authApi.logout();
      await authApi.mailbox(operation, { current_password: current, password });
    },
    onSuccess: async () => {
      await clearAccountScopedClientState(client);
      hardNavigate('/login');
    },
  });
  const setup = useMutation({
    mutationFn: () => authApi.mailbox('forgot-password', { email: security.data!.email }),
  });
  const link = useMutation({
    mutationFn: () => authApi.linkGoogle(current),
    onSuccess: (response) => hardNavigate(response.authorize_url),
  });
  return (
    <Stack as="section" gap="workspace" className="max-w-xl" aria-label="Account security">
      {showHeading && <EditorialSectionHeader title="Account security" />}
      {security.isPending && <p>Loading account security…</p>}
      {security.isError && (
        <Alert tone="danger">
          {authErrorMessage(security.error)}{' '}
          <Button className="w-fit" onClick={() => void security.refetch()}>
            Retry
          </Button>
        </Alert>
      )}
      <SecurityIdentity data={security.data} />
      {security.data?.methods.includes('password') ? (
        <Stack
          as="form"
          gap="workspace"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate('change-password');
          }}
        >
          <AuthPasswordField
            label="Current password"
            autoComplete="current-password"
            placeholder="Current password"
            inputProps={{
              value: current,
              onChange: (event) => setCurrent(event.target.value),
              required: true,
            }}
          />
          <AuthPasswordField
            label="New password"
            autoComplete="new-password"
            placeholder={passwordHint}
            inputProps={{
              value: password,
              onChange: (event) => setPassword(event.target.value),
              required: true,
              minLength: authFormPolicy.passwordMinLength,
              maxLength: authFormPolicy.passwordMaxLength,
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              Change password and sign out
            </Button>
            {!security.data.methods.includes('google') && (
              <Button
                type="button"
                variant="secondary"
                disabled={!current || link.isPending}
                onClick={() => link.mutate()}
              >
                Connect Google
              </Button>
            )}
          </div>
        </Stack>
      ) : (
        <Button
          className="w-fit"
          disabled={!security.data || setup.isPending}
          onClick={() => setup.mutate()}
        >
          Email password setup link
        </Button>
      )}
      {setup.isSuccess && <Alert tone="info">{setup.data.message}</Alert>}
      {setup.isError && <Alert tone="danger">{authErrorMessage(setup.error)}</Alert>}
      {mutation.isError && <Alert tone="danger">{authErrorMessage(mutation.error)}</Alert>}
      {link.isError && <Alert tone="danger">{authErrorMessage(link.error)}</Alert>}
      <Button className="w-fit" variant="secondary" onClick={() => setConfirm(true)}>
        Sign out all sessions
      </Button>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sign out all sessions?"
        footer={
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate('sign-out')}>
            Sign out everywhere
          </Button>
        }
      >
        <p>This signs out every device, including this one.</p>
      </Dialog>
    </Stack>
  );
}
