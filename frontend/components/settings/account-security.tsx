import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { authApi, authQueries } from '@/lib/api/auth';
import {
  authErrorMessage,
  changePasswordFormSchema,
  type ChangePasswordFormValues,
} from '@/lib/auth/forms';
import { passwordHint } from '@/lib/config/auth';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { restartAt } from '@/lib/auth/account-transition';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PasswordField } from '@/components/ui/password-field';
import { Inline, Stack } from '@/components/ui/layout';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionHeader, SectionTitle, SectionDescription } from '@/components/ui/section';
import { SettingRow } from '@/components/ui/setting-row';

const METHOD_LABELS: Record<string, string> = { password: 'Email and password', google: 'Google' };

function SecurityIdentity({
  data,
}: Readonly<{ data: Awaited<ReturnType<typeof authApi.security>> | undefined }>) {
  if (!data) return null;
  const methods = data.methods.map((method) => METHOD_LABELS[method] ?? method);
  return (
    <>
      <SettingRow
        label="Sign in with"
        description={methods.length ? methods.join(' or ') : 'No sign-in method yet'}
      />
      <SettingRow label="Email" description={data.email_verified ? 'Verified' : 'Not verified'} />
    </>
  );
}

function SignInMethods({
  security,
}: Readonly<{ security: UseQueryResult<Awaited<ReturnType<typeof authApi.security>>> }>) {
  return (
    <>
      {security.isPending && (
        <StateBlock
          kind="loading"
          label="Loading sign-in methods…"
          shape={{ kind: 'facts', rows: 2 }}
        />
      )}
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

/**
 * Validated in the form, not by the browser's bubble: each failing field says
 * why under itself and takes focus. A rejected change (a wrong current
 * password) is said under Current password.
 */
function PasswordForm({ form }: Readonly<{ form: ReturnType<typeof usePasswordForm> }>) {
  const {
    register,
    formState: { errors },
  } = form.fields;
  return (
    <form noValidate onSubmit={(event) => void form.submit(event)}>
      <Stack gap="workspace">
        <PasswordField
          label="Current password"
          autoComplete="current-password"
          placeholder="Current password"
          error={errors.current?.message}
          inputProps={register('current')}
        />
        <PasswordField
          label="New password"
          autoComplete="new-password"
          placeholder={passwordHint}
          error={errors.password?.message}
          inputProps={register('password')}
        />
        <Inline className="flex-wrap">
          <Button type="submit" variant="primary" disabled={form.change.isPending}>
            Change password and sign out
          </Button>
        </Inline>
      </Stack>
    </form>
  );
}

function usePasswordForm() {
  const client = useQueryClient();
  const fields = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { current: '', password: '' },
  });
  const change = useMutation({
    mutationFn: (values: ChangePasswordFormValues) =>
      authApi.mailbox('change-password', {
        current_password: values.current,
        password: values.password,
      }),
    onSuccess: () => restartAt(client, '/login'),
    onError: (error) =>
      fields.setError('current', { message: authErrorMessage(error) }, { shouldFocus: true }),
  });
  const submit = fields.handleSubmit((values) => change.mutate(values));
  return { fields, change, submit };
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
  const [confirm, setConfirm] = useState<'sign-out' | 'disconnect' | null>(null);
  const client = useQueryClient();
  const security = useQuery(authQueries.security());
  const passwordForm = usePasswordForm();
  const current = useWatch({ control: passwordForm.fields.control, name: 'current' });
  const mutation = useMutation({
    // Both end every session, this device's included (a sign-out is always everywhere).
    mutationFn: (operation: 'sign-out' | 'disconnect') =>
      operation === 'sign-out' ? authApi.logout() : authApi.logoutAndDisconnect(),
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
        <Stack gap="workspace">
          <SignInMethods security={security} />
          <SettingRow
            label="Password"
            description="Changing it signs you out everywhere."
            action={
              hasPassword ? null : (
                <Button
                  variant="secondary"
                  disabled={!security.data || setup.isPending}
                  onClick={() => setup.mutate()}
                >
                  Email password setup link
                </Button>
              )
            }
          >
            {hasPassword ? <PasswordForm form={passwordForm} /> : null}
          </SettingRow>
          {canLinkGoogle ? (
            <SettingRow
              label="Google sign-in"
              description="Enter your current password above, then connect Google."
              action={
                <ActionButton
                  action="connectGoogle"
                  type="button"
                  disabled={!current || link.isPending}
                  onClick={() => link.mutate()}
                />
              }
            />
          ) : null}
          {setup.isSuccess && <Notice tone="info">{setup.data.message}</Notice>}
          <ErrorAlerts errors={{ setup: setup.error, session: mutation.error, link: link.error }} />
        </Stack>
      </Section>
      <Section aria-labelledby="settings-sessions-title">
        <SectionHeader>
          <SectionTitle id="settings-sessions-title">Sessions</SectionTitle>
        </SectionHeader>
        <Stack gap="workspace">
          <SettingRow
            label="Sign out all sessions"
            description="Sign out every device, including this one."
            action={
              <Button variant="secondary" onClick={() => setConfirm('sign-out')}>
                Sign out all sessions
              </Button>
            }
          />
          <SettingRow
            label="Sign out and disconnect"
            description="Also disconnects your MCP clients and revokes your API keys."
            action={
              <Button variant="danger" onClick={() => setConfirm('disconnect')}>
                Sign out and disconnect
              </Button>
            }
          />
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
