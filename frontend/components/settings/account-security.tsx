import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api/auth';
import { authErrorMessage } from '@/lib/auth/forms';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { AuthPasswordField } from '@/components/auth/auth-form';

function SecurityIdentity({
  data,
}: Readonly<{ data: Awaited<ReturnType<typeof authApi.security>> | undefined }>) {
  if (!data) return null;
  return (
    <>
      <p>{data.email}</p>
      <p>
        Sign-in methods: {data.methods.join(', ')}. Email:{' '}
        {data.email_verified ? 'Verified' : 'Legacy or operator access; no verification recorded'}.
      </p>
    </>
  );
}

export default function AccountSecurity() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(false);
  const client = useQueryClient();
  const security = useQuery({
    queryKey: ['auth', 'security'],
    queryFn: authApi.security,
  });
  const mutation = useMutation({
    mutationFn: (operation: 'change-password' | 'logout-all') =>
      authApi.mailbox(operation, { current_password: current, password }),
    onSuccess: () => {
      client.clear();
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
    <section className="grid gap-4" aria-label="Account security">
      <h1>Account security</h1>
      {security.isPending && <p>Loading account security…</p>}
      {security.isError && (
        <Alert tone="danger">
          {authErrorMessage(security.error)}{' '}
          <Button onClick={() => void security.refetch()}>Retry</Button>
        </Alert>
      )}
      <SecurityIdentity data={security.data} />
      {security.data?.methods.includes('password') ? (
        <form
          className="grid gap-4"
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
            placeholder="At least 8 characters"
            inputProps={{
              value: password,
              onChange: (event) => setPassword(event.target.value),
              required: true,
              minLength: 8,
              maxLength: 128,
            }}
          />
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
              Connect Google using current password
            </Button>
          )}
        </form>
      ) : (
        <Button disabled={!security.data || setup.isPending} onClick={() => setup.mutate()}>
          Email password setup link
        </Button>
      )}
      {setup.isSuccess && <Alert tone="info">{setup.data.message}</Alert>}
      {setup.isError && <Alert tone="danger">{authErrorMessage(setup.error)}</Alert>}
      {mutation.isError && <Alert tone="danger">{authErrorMessage(mutation.error)}</Alert>}
      {link.isError && <Alert tone="danger">{authErrorMessage(link.error)}</Alert>}
      <Button variant="secondary" onClick={() => setConfirm(true)}>
        Sign out all sessions
      </Button>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sign out all sessions?"
        footer={
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate('logout-all')}>
            Sign out everywhere
          </Button>
        }
      >
        <p>This signs out every device, including this one.</p>
      </Dialog>
    </section>
  );
}
