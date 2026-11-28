import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { BackfillProgress } from '@/components/settings/backfill-progress';
import {
  FAMILY_META,
  GRANT_FAMILY,
  PROVIDER_META,
  isIntegrationProvider,
  joinProviderLabels,
  type GrantFamily,
} from '@/components/settings/grant-model';
import { Button } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { Text } from '@/components/ui/typography';
import {
  integrationsApi,
  refreshImportedReads,
  type IntegrationProvider,
} from '@/lib/api/integrations';
import { Plug, type IconGlyph } from '@/lib/icons';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { projectDestination } from '@/lib/navigation/project-destination';
import { useSetUrlParams, useUrlParam, useUrlSearch } from '@/lib/navigation/url-params';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

import {
  CONNECT_ADMIN_ONLY,
  ConnectProviderButton,
} from '@/components/settings/connect-provider-button';

import { usePropertyChoice } from './property-choice';
import { oauthErrorMessage, useDataSources, type SourceStep } from './data-sources';
import { Notice } from '@/components/ui/notice';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';

function useOAuthReturn() {
  const connectedParam = useUrlParam('connected');
  const errorParam = useUrlParam('error');
  const setUrlParams = useSetUrlParams();
  const [result] = useState(() => ({ connected: connectedParam, error: errorParam }));
  const client = useQueryClient();
  useEffect(() => {
    if (!result.connected && !result.error) return;
    if (result.connected) void refreshImportedReads(client);
    setUrlParams({ connected: null, error: null }, 'replace');
  }, [client, result, setUrlParams]);
  const connected = isIntegrationProvider(result.connected) ? GRANT_FAMILY[result.connected] : null;
  return { connected, error: result.error };
}

type FamilyProviders = [IntegrationProvider, ...IntegrationProvider[]];

type Row =
  | { kind: 'connect'; family: GrantFamily; providers: FamilyProviders }
  | {
      kind: 'source';
      provider: IntegrationProvider;
      step: Exclude<SourceStep, { kind: 'connect' }>;
    };

function setupRows(
  providers: readonly IntegrationProvider[],
  steps: ReadonlyMap<IntegrationProvider, SourceStep>,
): Row[] {
  const rows: Row[] = [];
  for (const provider of providers) {
    const step = steps.get(provider) ?? { kind: 'connect' };
    if (step.kind !== 'connect') {
      rows.push({ kind: 'source', provider, step });
      continue;
    }
    const family = GRANT_FAMILY[provider];
    const existing = rows.find(
      (row): row is Extract<Row, { kind: 'connect' }> =>
        row.kind === 'connect' && row.family === family,
    );
    if (existing) existing.providers.push(provider);
    else rows.push({ kind: 'connect', family, providers: [provider] });
  }
  return rows;
}

function RowFrame({
  Icon: glyph,
  title,
  status,
  action,
  children,
}: Readonly<{
  Icon: IconGlyph;
  title: string;
  status: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <Stack as="li" gap="compact">
      <Inline gap="compact" stackBelowDesktop>
        <Inline gap="compact" align="start" box="fill">
          <Icon icon={glyph} tone="ink-2" />
          <div className="min-w-0">
            <Text as="div" variant="body" wrap="truncate">
              {title}
            </Text>
            <Text as="div" variant="caption">
              {status}
            </Text>
          </div>
        </Inline>
        {action ? (
          <Inline wrap box="fixed-full">
            {action}
          </Inline>
        ) : null}
      </Inline>
      {children}
    </Stack>
  );
}

function setupTitle(
  required: readonly IntegrationProvider[],
  steps: ReadonlyMap<IntegrationProvider, SourceStep>,
  connectTitle: string,
): string {
  const pending = required.map((provider) => ({
    provider,
    step: steps.get(provider) ?? { kind: 'connect' as const },
  }));
  if (pending.some(({ step }) => step.kind === 'connect')) return connectTitle;
  const reconnect = pending.find(({ step }) => step.kind === 'reconnect');
  if (reconnect) return `Reconnect ${FAMILY_META[GRANT_FAMILY[reconnect.provider]].title}`;
  const choose = pending.find(({ step }) => step.kind === 'choose');
  if (choose) return `Choose the ${PROVIDER_META[choose.provider].noun}`;
  return 'Data sources';
}

function ConnectRow({
  family,
  providers,
  required,
  canManage,
  startConnect,
}: Readonly<{
  family: GrantFamily;
  providers: FamilyProviders;
  required: boolean;
  canManage: boolean;
  startConnect: (family: GrantFamily) => void;
}>) {
  return (
    <RowFrame
      Icon={PROVIDER_META[providers[0]].Icon}
      title={joinProviderLabels(providers)}
      status={required ? 'Not connected' : 'Optional'}
      action={
        canManage ? (
          <ConnectProviderButton family={family} onConnect={() => startConnect(family)} />
        ) : (
          <Text variant="caption">{CONNECT_ADMIN_ONLY}</Text>
        )
      }
    />
  );
}

function SourceRow({
  provider,
  step,
  projectId,
  canManage,
  autoStart,
  startConnect,
}: Readonly<{
  provider: IntegrationProvider;
  step: Exclude<SourceStep, { kind: 'connect' }>;
  projectId: string;
  canManage: boolean;
  autoStart: boolean;
  startConnect: (family: GrantFamily) => void;
}>) {
  const source = PROVIDER_META[provider];
  const family = GRANT_FAMILY[provider];
  const familyName = FAMILY_META[family].title;
  if (step.kind === 'reconnect')
    return (
      <RowFrame
        Icon={source.Icon}
        title={source.label}
        status={`${familyName} needs your consent again. Imported data is kept.`}
        action={
          canManage ? (
            <Button variant="secondary" onClick={() => startConnect(family)}>
              Reconnect {familyName}
            </Button>
          ) : null
        }
      />
    );
  if (step.kind === 'ready')
    return (
      <RowFrame
        Icon={source.Icon}
        title={source.label}
        status={
          <Inline as="span" gap="meta">
            {step.connection.provider === 'ga4' ? (
              <Text variant="caption" numeric>
                {step.mapping.property_ref}
              </Text>
            ) : (
              <ClampText>{step.mapping.property_ref}</ClampText>
            )}
            <BackfillProgress
              workspaceId={step.connection.workspace_id}
              connectionId={step.connection.id}
            />
          </Inline>
        }
      />
    );
  const status = 'Connected';
  if (!canManage)
    return (
      <RowFrame Icon={source.Icon} title={source.label} status={status}>
        <Text as="p" variant="caption">
          {CONNECT_ADMIN_ONLY}
        </Text>
      </RowFrame>
    );
  return (
    <ChooseRow
      provider={provider}
      connection={step.connection}
      projectId={projectId}
      autoStart={autoStart}
      status={status}
    />
  );
}

function ChooseRow({
  status,
  ...choice
}: Readonly<Parameters<typeof usePropertyChoice>[0] & { status: string }>) {
  const source = PROVIDER_META[choice.provider];
  const { action, body } = usePropertyChoice(choice);
  return (
    <RowFrame Icon={source.Icon} title={source.label} status={status} action={action}>
      {body}
    </RowFrame>
  );
}

function unconnectedFamilies({
  sources,
  oauth,
  rows,
}: Readonly<{
  sources: ReturnType<typeof useDataSources>;
  oauth: ReturnType<typeof useOAuthReturn>;
  rows: readonly Row[];
}>): GrantFamily[] | null {
  if (sources.error || oauth.error || oauth.connected) return null;
  const families: GrantFamily[] = [];
  for (const row of rows) {
    if (row.kind !== 'connect') return null;
    families.push(row.family);
  }
  return families;
}

function UnconnectedState({
  heading,
  icon,
  connect,
  families,
  canManage,
  startConnect,
}: Readonly<{
  heading: string;
  icon?: IconGlyph;
  connect?: string;
  families: readonly GrantFamily[];
  canManage: boolean;
  startConnect: (family: GrantFamily) => void;
}>) {
  const [lead, ...rest] = families;
  const action =
    canManage && lead ? (
      <>
        <ConnectProviderButton family={lead} label={connect} onConnect={() => startConnect(lead)} />
        {rest.slice(0, 1).map((family) => (
          <Button key={family} variant="quiet" onClick={() => startConnect(family)}>
            <Icon icon={Plug} />
            Connect {FAMILY_META[family].title}
          </Button>
        ))}
      </>
    ) : (
      <Text variant="caption">{CONNECT_ADMIN_ONLY}</Text>
    );
  return <StateBlock kind="empty" icon={icon} heading={heading} action={action} />;
}

export function DataSourceSetup({
  required,
  optional = [],
  title,
  whenReady = null,
  unconnected,
}: Readonly<{
  required: readonly IntegrationProvider[];
  optional?: readonly IntegrationProvider[];
  title: string;
  whenReady?: ReactNode;
  unconnected?: Readonly<{ heading: string; icon?: IconGlyph; connect?: string }>;
}>) {
  const { activeProject, activeWorkspaceId } = useProjectContext();
  const canManage = useWorkspaceCapability('manage_credentials');
  const location = useLocation();
  const params = useUrlSearch();
  const providers = [...required, ...optional];
  const sources = useDataSources(activeWorkspaceId, activeProject?.id ?? null, providers);
  const oauth = useOAuthReturn();

  if (!activeProject || !activeWorkspaceId || sources.loading) return null;
  const allReady = required.every((provider) => sources.steps.get(provider)?.kind === 'ready');
  if (!sources.error && allReady && !oauth.error) return whenReady;

  const startConnect = (family: GrantFamily) =>
    hardNavigate(
      integrationsApi.oauthStartUrl(
        FAMILY_META[family].connectProvider,
        activeWorkspaceId,
        projectDestination(location.pathname, params, activeProject.id),
      ),
    );

  const rows = setupRows(providers, sources.steps);
  const families = unconnectedFamilies({ sources, oauth, rows });
  if (unconnected && families)
    return (
      <UnconnectedState
        {...unconnected}
        families={families}
        canManage={canManage}
        startConnect={startConnect}
      />
    );
  return (
    <SetupCard
      required={required}
      title={title}
      rows={rows}
      sources={sources}
      oauth={oauth}
      canManage={canManage}
      projectId={activeProject.id}
      startConnect={startConnect}
    />
  );
}

function SetupCard({
  required,
  title,
  rows,
  sources,
  oauth,
  canManage,
  projectId,
  startConnect,
}: Readonly<{
  required: readonly IntegrationProvider[];
  title: string;
  rows: readonly Row[];
  sources: ReturnType<typeof useDataSources>;
  oauth: ReturnType<typeof useOAuthReturn>;
  canManage: boolean;
  projectId: string;
  startConnect: (family: GrantFamily) => void;
}>) {
  return (
    <Section data-testid="data-source-setup">
      <SectionHeader>
        <SectionTitle>
          {sources.error ? 'Data sources' : setupTitle(required, sources.steps, title)}
        </SectionTitle>
      </SectionHeader>
      {oauth.error ? <Notice tone="negative">{oauthErrorMessage(oauth.error)}</Notice> : null}
      {oauth.connected ? (
        <Notice tone="positive">{FAMILY_META[oauth.connected].title} connected.</Notice>
      ) : null}
      {sources.error ? (
        <Notice
          kind="read"
          title="Couldn't load your data sources"
          error={sources.error}
          fallback="Couldn't load your data sources. The request failed or timed out."
          onRetry={sources.retry}
        />
      ) : (
        <SectionBleed as="ul" rows>
          {rows.map((row) =>
            row.kind === 'connect' ? (
              <ConnectRow
                key={`connect-${row.family}`}
                family={row.family}
                providers={row.providers}
                required={row.providers.some((provider) => required.includes(provider))}
                canManage={canManage}
                startConnect={startConnect}
              />
            ) : (
              <SourceRow
                key={row.provider}
                provider={row.provider}
                step={row.step}
                projectId={projectId}
                canManage={canManage}
                autoStart={oauth.connected === GRANT_FAMILY[row.provider]}
                startConnect={startConnect}
              />
            ),
          )}
        </SectionBleed>
      )}
    </Section>
  );
}
