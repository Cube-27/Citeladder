import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api/auth';
import { authFormPolicy, passwordHint } from '@/lib/config/auth';
import { authErrorMessage } from '@/lib/auth/forms';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { restartAt } from '@/lib/auth/account-transition';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { AuthPasswordField } from '@/components/auth/auth-form';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';

import { SettingsFacts, SettingsSection } from './settings-section';

const METHOD_LABELS: Record<string, string> = { password: 'Email and password', google: 'Google' };

function SecurityIdentity({
  data,
}: Readonly<{ data: Awaited<ReturnType<typeof authApi.security>> | undefined }>) {
  if (!data) return null;
  const methods = data.methods.map((method) => METHOD_LABELS[method] ?? method);
  return (
    <SettingsFacts
      facts={[
        ['Sign in with', methods.length ? methods.join(' or ') : 'No sign-in method yet'],
        ['Email', data.email_verified ? 'Verified' : 'Not verified'],
      ]}
    />
  );
}

/**
 * The account's sign-in, password and session controls, as settings
 * sections. Place it inside `SettingsSections`.
 */
export default function AccountSecurity() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState<'sign-out' | 'disconnect' | null>(null);
  const client = useQueryClient();
  const security = useQuery({
    queryKey: ['auth', 'security'],
    queryFn: authApi.security,
  });
  const mutation = useMutation({
    // All end every session, this device's included (a sign-out is always everywhere).
    mutationFn: async (operation: 'change-password' | 'sign-out' | 'disconnect') => {
      if (operation === 'sign-out') return authApi.logout();
      if (operation === 'disconnect') return authApi.logoutAndDisconnect();
      await authApi.mailbox(operation, { current_password: current, password });
    },
    onSuccess: () => restartAt(client, '/login'),
  });
  const setup = useMutation({
    mutationFn: () => authApi.mailbox('forgot-password', { email: security.data!.email }),
  });
  const link = useMutation({
    mutationFn: () => authApi.linkGoogle(current),
    onSuccess: (response) => hardNavigate(response.authorize_url),
  });
  const hasPassword = security.data?.methods.includes('password') ?? false;
  const canLinkGoogle = hasPassword && !security.data?.methods.includes('google');
  return (
    <>
      <SettingsSection title="Sign-in" description="How you sign in to CiteLadder.">
        {security.isPending && <p className={textRole('body')}>Loading account security…</p>}
        {security.isError && (
          <Alert tone="danger">
            {authErrorMessage(security.error)}{' '}
            <Button className="w-fit" onClick={() => void security.refetch()}>
              Retry
            </Button>
          </Alert>
        )}
        <SecurityIdentity data={security.data} />
      </SettingsSection>
      <SettingsSection
        title="Password"
        description={
          canLinkGoogle
            ? 'Changing it signs you out everywhere. To connect Google, enter your current password, then choose Connect Google.'
            : 'Changing it signs you out everywhere.'
        }
      >
        {hasPassword ? (
          <Stack
            as="form"
            gap="workspace"
            className="max-w-md"
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
              {canLinkGoogle && (
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
      </SettingsSection>
      <SettingsSection title="Sessions" description="Sign out every device, including this one.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setConfirm('sign-out')}>
            Sign out all sessions
          </Button>
          <Button variant="destructiveGhost" onClick={() => setConfirm('disconnect')}>
            Sign out everywhere and disconnect integrations
          </Button>
        </div>
      </SettingsSection>
      <Dialog
        open={confirm === 'sign-out'}
        onOpenChange={(open) => setConfirm(open ? 'sign-out' : null)}
        title="Sign out all sessions?"
        footer={
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate('sign-out')}>
            Sign out everywhere
          </Button>
        }
      >
        <p>This signs out every device, including this one.</p>
      </Dialog>
      <Dialog
        open={confirm === 'disconnect'}
        onOpenChange={(open) => setConfirm(open ? 'disconnect' : null)}
        title="Disconnect integrations and sign out?"
        footer={
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('disconnect')}
          >
            Sign out and disconnect
          </Button>
        }
      >
        <p>
          This signs out every device, including this one. It also disconnects every MCP client you
          connected and revokes every API key you created. Integrations that use them stop working
          until you connect them again.
        </p>
      </Dialog>
    </>
  );
}
