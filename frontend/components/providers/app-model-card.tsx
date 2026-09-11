'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import { providersApi, type ProviderAppRouteInput } from '@/lib/api/providers';
import { queryKeys } from '@/lib/api/query-keys';
import type { ProviderConnection } from '@/lib/api/types';

const CONNECTION_LABEL = 'Content and Growth Agent custom model';

type AppModelForm = {
  baseUrl: string;
  model: string;
  apiKey: string;
  content: boolean;
  growthAgent: boolean;
};

function initialForm(connection?: ProviderConnection): AppModelForm {
  const route = connection?.app_routes?.[0];
  return {
    baseUrl: route?.api_base_url ?? '',
    model: route?.model ?? '',
    apiKey: '',
    content: connection?.app_routes?.some((entry) => entry.feature === 'content') ?? true,
    growthAgent: connection?.app_routes?.some((entry) => entry.feature === 'growth_agent') ?? true,
  };
}

function appRoutes(form: AppModelForm): ProviderAppRouteInput[] {
  const route = (feature: ProviderAppRouteInput['feature']): ProviderAppRouteInput => ({
    feature,
    model: form.model,
    api_base_url: form.baseUrl,
  });
  return [
    form.content ? route('content') : null,
    form.growthAgent ? route('growth_agent') : null,
  ].filter((entry): entry is ProviderAppRouteInput => entry !== null);
}

function saveConnection(connection: ProviderConnection | undefined, form: AppModelForm) {
  const payload = {
    api_key: form.apiKey,
    app_routes: appRoutes(form),
    confirm_destination_change: true,
  };
  if (connection) return providersApi.updateConnection(connection.id, payload);
  return providersApi.createConnection({
    transport_provider: 'openai',
    label: CONNECTION_LABEL,
    ...payload,
  });
}

function useAppModelForm(connections: ProviderConnection[]) {
  const queryClient = useQueryClient();
  const connection = useMemo(
    () => connections.find((entry) => (entry.app_routes?.length ?? 0) > 0),
    [connections],
  );
  const [form, setForm] = useState(() => initialForm(connection));
  const update = <Key extends keyof AppModelForm>(key: Key, value: AppModelForm[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () => saveConnection(connection, form),
    onSuccess: async () => {
      update('apiKey', '');
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.all });
    },
  });
  const test = useMutation({
    mutationFn: () => providersApi.testConnection(connection!.id),
  });
  const validDestination = form.baseUrl.startsWith('https://') && form.model.trim() !== '';
  return {
    connection,
    existingRoute: connection?.app_routes?.[0],
    form,
    update,
    save,
    test,
    canSave:
      validDestination &&
      (form.content || form.growthAgent) &&
      Boolean(connection || form.apiKey) &&
      !save.isPending,
  };
}

type Controller = ReturnType<typeof useAppModelForm>;

function ConnectionStatus({ controller }: Readonly<{ controller: Controller }>) {
  const { connection, existingRoute } = controller;
  if (existingRoute?.verified) {
    return (
      <Badge variant="status" value="success">
        Connected
      </Badge>
    );
  }
  return (
    <Badge variant="status" value="info">
      {connection ? 'Needs test' : 'Not saved'}
    </Badge>
  );
}

function DestinationFields({ controller }: Readonly<{ controller: Controller }>) {
  const { form, update } = controller;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="API base URL"
        hint="HTTPS only. The server validates the destination before saving."
      >
        {(props) => (
          <Input
            {...props}
            type="url"
            value={form.baseUrl}
            onChange={(event) => update('baseUrl', event.target.value)}
            placeholder="https://api.example.com/v1"
          />
        )}
      </Field>
      <Field label="Model" hint="Sent exactly to the server-validated probe.">
        {(props) => (
          <Input
            {...props}
            value={form.model}
            onChange={(event) => update('model', event.target.value)}
            placeholder="your-model-name"
          />
        )}
      </Field>
    </div>
  );
}

function CredentialField({ controller }: Readonly<{ controller: Controller }>) {
  const { connection, form, update } = controller;
  return (
    <Field
      label={connection ? 'API key (enter a new key to rotate)' : 'API key'}
      hint="Write-only. Never returned, displayed after save, or stored in browser storage."
    >
      {(props) => (
        <Input
          {...props}
          type="password"
          autoComplete="off"
          value={form.apiKey}
          onChange={(event) => update('apiKey', event.target.value)}
          placeholder={connection ? '•••••••• stored' : 'Paste API key'}
        />
      )}
    </Field>
  );
}

function RouteFields({ controller }: Readonly<{ controller: Controller }>) {
  const { form, update } = controller;
  return (
    <div className="flex flex-wrap gap-4">
      <Checkbox
        checked={form.content}
        onCheckedChange={(checked) => update('content', checked === true)}
        label="Content route"
      />
      <Checkbox
        checked={form.growthAgent}
        onCheckedChange={(checked) => update('growthAgent', checked === true)}
        label="Growth Agent route"
      />
    </div>
  );
}

function OperationFeedback({ controller }: Readonly<{ controller: Controller }>) {
  const { save, test } = controller;
  if (save.isError || test.isError) {
    return (
      <Alert tone="danger">
        The server refused this provider configuration. Check permission, URL, model, and key.
      </Alert>
    );
  }
  if (!test.data) return null;
  const succeeded = test.data.status === 'ok';
  return (
    <Alert tone={succeeded ? 'success' : 'danger'}>
      {test.data.detail || (succeeded ? 'Connection succeeded' : 'Connection failed')}
    </Alert>
  );
}

function FormActions({ controller }: Readonly<{ controller: Controller }>) {
  const { connection, save, test, canSave } = controller;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        variant="secondary"
        disabled={!connection || save.isPending || test.isPending}
        onClick={() => test.mutate()}
      >
        {test.isPending ? 'Testing…' : 'Test connection'}
      </Button>
      <Button disabled={!canSave} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : connection ? 'Save changes' : 'Save configuration'}
      </Button>
    </div>
  );
}

export function AppModelCard({ connections }: Readonly<{ connections: ProviderConnection[] }>) {
  const controller = useAppModelForm(connections);
  return (
    <section className={panelClasses({}, 'grid gap-4')} aria-labelledby="app-model-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="app-model-title" className={textRole('bodyStrong')}>
            Custom model (Content & Growth Agent)
          </h2>
          <p className={textRole('body')}>
            True BYOK is customer-funded and spends no platform AI credits.
          </p>
        </div>
        <ConnectionStatus controller={controller} />
      </div>
      <DestinationFields controller={controller} />
      <CredentialField controller={controller} />
      <RouteFields controller={controller} />
      <Alert tone="info">
        Fallback: none. If this route is missing, revoked, or fails validation, the request is
        refused rather than silently using a platform key.
      </Alert>
      <OperationFeedback controller={controller} />
      <FormActions controller={controller} />
    </section>
  );
}
