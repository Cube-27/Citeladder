import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { authApi, authQueries } from '@/lib/api/auth';
import { authFormPolicy, passwordHint } from '@/lib/config/auth';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { restartAt } from '@/lib/auth/account-transition';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PasswordField } from '@/components/ui/password-field';
import { FactList } from '@/components/ui/facts';
import { Inline, Stack } from '@/components/ui/layout';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionHeader, SectionTitle, SectionDescription } from '@/components/ui/section';
import { textRole } from '@/components/ui/typography';

const METHOD_LABELS: Record<string, string> = { password: 'Email and password', google: 'Google' };

function SecurityIdentity({
  data,
}: Readonly<{ data: Awaited<ReturnType<typeof authApi.security>> | undefined }>) {
  if (!data) return null;
  const methods = data.methods.map((method) => METHOD_LABELS[method] ?? method);
  return (
    <FactList
      layout="ruled"
      facts={[
        {
          label: 'Sign in with',
          value: methods.length ? methods.join(' or ') : 'No sign-in method yet',
        },
        { label: 'Email', value: data.email_verified ? 'Verified' : 'Not verified' },
      ]}
    />
  );
}

function SignInMethods({
  security,
}: Readonly<{ security: UseQueryResult<Awaited<ReturnType<typeof authApi.security>>> }>) {
  return (
    <>
      {security.isPending && <StateBlock kind="loading" label="Loading sign-in methods…" />}
      {security.isError && (
        <Notice
          kind="read"
          title="Couldn't load your sign-in methods"
          fallback="Account security could not be loaded."
          {...readErrorProps(security)}
        />
      )}
      <SecurityIdentity data={security.data} />
    </>
  );
}

/** A group head inside a card: `subheading`, with its caption. */
function GroupHead({ title, caption }: Readonly<{ title: string; caption: string }>) {
  return (
    <Stack gap="tight">
      <h3 className={textRole('subheading')}>{title}</h3>
      <p className={textRole('caption')}>{caption}</p>
    </Stack>
  );
}

/** One danger alert per failed request, keyed by the request's name. */
function ErrorAlerts({ errors }: Readonly<{ errors: Readonly<Record<string, Error | null>> }>) {
  return Object.entries(errors).map(([name, error]) =>
    error ? (
      <Notice
        kind="mutation"
        key={name}
        notice={mutationNoticeForError(error, { action: 'update your sign-in settings' })}
      />
    ) : null,
  );
}

/**
 * The account's sign-in, password and session controls, as settings
 * sections. Place it inside `SectionStack`.
 */
export default function AccountSecurity() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState<'sign-out' | 'disconnect' | null>(null);
  const client = useQueryClient();
  const security = useQuery(authQueries.security());
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
    mutationFn: () => authApi.passwordLink(),
  });
  const link = useMutation({
    mutationFn: () => authApi.linkGoogle(current),
    onSuccess: (response) => hardNavigate(response.authorize_url),
  });
  const hasPassword = security.data?.methods.includes('password') ?? false;
  const canLinkGoogle = hasPassword && !security.data?.methods.includes('google');
  return (
    <>
      {/* One card for how you sign in: the methods, the password and Google. */}
      <Section aria-labelledby="settings-sign-in-title">
        <SectionHeader>
          <SectionTitle id="settings-sign-in-title">Sign-in</SectionTitle>
          <SectionDescription>How you sign in to CiteLadder.</SectionDescription>
        </SectionHeader>
        <Stack gap="item">
          <SignInMethods security={security} />
          <GroupHead title="Password" caption="Changing it signs you out everywhere." />
          {hasPassword ? (
            <Stack
              as="form"
              gap="workspace"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate('change-password');
              }}
            >
              <PasswordField
                label="Current password"
                autoComplete="current-password"
                placeholder="Current password"
                inputProps={{
                  value: current,
                  onChange: (event) => setCurrent(event.target.value),
                  required: true,
                }}
              />
              <PasswordField
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
              <Inline className="flex-wrap">
                <Button type="submit" variant="primary" disabled={mutation.isPending}>
                  Change password and sign out
                </Button>
              </Inline>
            </Stack>
          ) : (
            <Inline>
              <Button
                variant="secondary"
                disabled={!security.data || setup.isPending}
                onClick={() => setup.mutate()}
              >
                Email password setup link
              </Button>
            </Inline>
          )}
          {canLinkGoogle ? (
            <>
              <GroupHead
                title="Google sign-in"
                caption="Enter your current password above, then connect Google."
              />
              <Inline>
                <ActionButton
                  action="connectGoogle"
                  type="button"
                  disabled={!current || link.isPending}
                  onClick={() => link.mutate()}
                />
              </Inline>
            </>
          ) : null}
          {setup.isSuccess && <Notice tone="info">{setup.data.message}</Notice>}
          <ErrorAlerts errors={{ setup: setup.error, session: mutation.error, link: link.error }} />
        </Stack>
      </Section>
      <Section aria-labelledby="settings-sessions-title">
        <SectionHeader>
          <SectionTitle id="settings-sessions-title">Sessions</SectionTitle>
          <SectionDescription>Sign out every device, including this one.</SectionDescription>
        </SectionHeader>
        <Stack gap="item">
          <Inline className="flex-wrap">
            <Button variant="secondary" onClick={() => setConfirm('sign-out')}>
              Sign out all sessions
            </Button>
            <Button variant="danger" onClick={() => setConfirm('disconnect')}>
              Sign out and disconnect
            </Button>
          </Inline>
        </Stack>
      </Section>
      <Dialog
        open={confirm === 'sign-out'}
        onOpenChange={(open) => setConfirm(open ? 'sign-out' : null)}
        title="Sign out all sessions?"
        footer={
          <Button
            variant="primary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('sign-out')}
          >
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
            variant="danger"
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
