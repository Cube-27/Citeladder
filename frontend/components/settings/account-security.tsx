import { useId, useState } from 'react';
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
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { restartAt } from '@/lib/auth/account-transition';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/dialog';
import { PasswordInput } from '@/components/ui/password-field';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Tooltip } from '@/components/ui/tooltip';
import { SettingField, SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';

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
        value={methods.length ? methods.join(' or ') : 'No sign-in method yet'}
      />
      <SettingRow label="Email" value={data.email_verified ? 'Verified' : 'Not verified'} />
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

function PasswordFields({ form }: Readonly<{ form: ReturnType<typeof usePasswordForm> }>) {
  const {
    register,
    formState: { errors },
  } = form.fields;
  return (
    <SettingRow label="Password">
      {PASSWORD_INPUTS.map((input) => (
        <SettingField
          key={input.name}
          label={input.label}
          inline="wide"
          required
          error={errors[input.name]?.message}
        >
          {(control) => (
            <PasswordInput
              label={input.label}
              autoComplete={input.autoComplete}
              placeholder={input.placeholder}
              inputProps={register(input.name)}
              control={control}
            />
          )}
        </SettingField>
      ))}
    </SettingRow>
  );
}

const PASSWORD_INPUTS = [
  {
    name: 'current',
    label: 'Current password',
    autoComplete: 'current-password',
    placeholder: 'Current password',
  },
  {
    name: 'password',
    label: 'New password',
    autoComplete: 'new-password',
    placeholder: passwordHint,
  },
] as const;

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
      fields.setError(
        'current',
        { message: authErrorMessage(error, "Couldn't change the password. Try again.") },
        { shouldFocus: true },
      ),
  });
  const submit = fields.handleSubmit((values) => change.mutate(values));
  return { fields, change, submit };
}

const GOOGLE_REASON = 'Enter your current password first';

function ConnectGoogle({
  needsPassword,
  pending,
  onConnect,
}: Readonly<{ needsPassword: boolean; pending: boolean; onConnect: () => void }>) {
  const reasonId = useId();
  if (!needsPassword)
    return (
      <ActionButton action="connectGoogle" type="button" disabled={pending} onClick={onConnect} />
    );
  return (
    <>
      <Tooltip content={GOOGLE_REASON} describe={false}>
        <ActionButton
          action="connectGoogle"
          type="button"
          aria-disabled="true"
          aria-describedby={reasonId}
        />
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {GOOGLE_REASON}
      </span>
    </>
  );
}

function ErrorAlerts({ errors }: Readonly<{ errors: Readonly<Record<string, Error | null>> }>) {
  return Object.entries(errors).map(([name, error]) =>
    error ? (
      <Notice kind="mutation" key={name} error={error} act="update your sign-in settings" />
    ) : null,
  );
}

type SessionOperation = 'sign-out' | 'disconnect';

function sessionRequest(operation: SessionOperation, onConfirm: () => void): ConfirmRequest {
  switch (operation) {
    case 'sign-out':
      return {
        question: 'Sign out all sessions',
        body: 'Includes this device.',
        confirmLabel: 'Sign out all sessions',
        onConfirm,
      };
    case 'disconnect':
      return {
        question: 'Disconnect integrations and sign out',
        body: 'Signs out every device, disconnects your MCP clients and revokes your API keys.',
        confirmLabel: 'Sign out and disconnect',
        destructive: true,
        onConfirm,
      };
    default: {
      const unhandled: never = operation;
      return unhandled;
    }
  }
}

export default function AccountSecurity() {
  const [confirm, setConfirm] = useState<SessionOperation | null>(null);
  const client = useQueryClient();
  const security = useQuery(authQueries.security());
  const passwordForm = usePasswordForm();
  const current = useWatch({ control: passwordForm.fields.control, name: 'current' });
  const mutation = useMutation({
    mutationFn: (operation: SessionOperation) =>
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
  const dirty = passwordForm.fields.formState.isDirty;
  return (
    <>
      <SettingsGroup title="Sign-in">
        {setup.isSuccess && <Notice tone="info">{setup.data.message}</Notice>}
        <ErrorAlerts errors={{ setup: setup.error, session: mutation.error, link: link.error }} />
        <SettingRows
          onSubmit={(event) => void passwordForm.submit(event)}
          foot={
            hasPassword ? (
              <Button
                type="submit"
                variant="primary"
                disabled={!dirty || passwordForm.change.isPending}
              >
                Change password and sign out
              </Button>
            ) : null
          }
        >
          <SignInMethods security={security} />
          {hasPassword ? (
            <PasswordFields form={passwordForm} />
          ) : (
            <SettingRow
              label="Password"
              action={
                <Button
                  variant="secondary"
                  disabled={!security.data || setup.isPending}
                  onClick={() => setup.mutate()}
                >
                  Email password setup link
                </Button>
              }
            />
          )}
          {canLinkGoogle ? (
            <SettingRow
              label="Google sign-in"
              action={
                <ConnectGoogle
                  needsPassword={!current}
                  pending={link.isPending}
                  onConnect={() => link.mutate()}
                />
              }
            />
          ) : null}
        </SettingRows>
      </SettingsGroup>
      <SettingsGroup title="Sessions">
        <SettingRows>
          <SettingRow
            label="Sign out all sessions"
            action={
              <Button variant="secondary" onClick={() => setConfirm('sign-out')}>
                Sign out all sessions
              </Button>
            }
          />
          <SettingRow
            label="Sign out and disconnect"
            action={
              <Button variant="danger" onClick={() => setConfirm('disconnect')}>
                Sign out and disconnect
              </Button>
            }
          />
        </SettingRows>
      </SettingsGroup>
      <ConfirmDialog
        request={
          confirm
            ? sessionRequest(confirm, () =>
                mutation.mutate(confirm, { onError: () => setConfirm(null) }),
              )
            : null
        }
        pending={mutation.isPending}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
