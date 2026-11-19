import { useQueryClient } from '@tanstack/react-query';
import { Plug, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { BackfillProgress } from '@/components/settings/backfill-progress';
import {
  FAMILY_META,
  GRANT_FAMILY,
  PROVIDER_META,
  isIntegrationProvider,
  joinProviderLabels,
  type GrantFamily,
} from '@/components/settings/grant-model';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { InlineFigure, textRole } from '@/components/ui/typography';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import {
  integrationsApi,
  refreshImportedReads,
  type IntegrationProvider,
} from '@/lib/api/integrations';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { projectDestination } from '@/lib/navigation/project-destination';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

import { usePropertyChoice } from './property-choice';
import { oauthErrorMessage, useDataSources, type SourceStep } from './data-sources';
import { Notice } from '@/components/ui/notice';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';

/**
 * The OAuth callback's result on this screen, read once and then removed from
 * the address bar so a refresh never shows it again.
 */
function useOAuthReturn() {
  const [params, setParams] = useSearchParams();
  const [result] = useState(() => ({
    connected: params.get('connected'),
    error: params.get('error'),
  }));
  const client = useQueryClient();
  useEffect(() => {
    if (!result.connected && !result.error) return;
    if (result.connected) void refreshImportedReads(client);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('connected');
        next.delete('error');
        return next;
      },
      { replace: true },
    );
  }, [client, result, setParams]);
  const connected = isIntegrationProvider(result.connected) ? GRANT_FAMILY[result.connected] : null;
  return { connected, error: result.error };
}

/** A Connect row starts from the provider that opened it, so it is never empty. */
type FamilyProviders = [IntegrationProvider, ...IntegrationProvider[]];

type Row =
  | { kind: 'connect'; family: GrantFamily; providers: FamilyProviders }
  | {
      kind: 'source';
      provider: IntegrationProvider;
      step: Exclude<SourceStep, { kind: 'connect' }>;
    };

/** One Connect row per grant family: a single Google consent covers Search Console and GA4. */
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
  Icon: LucideIcon;
  title: string;
  status: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <Stack as="li" gap="compact" className={ledgerItemClasses()}>
      <Inline
        gap="compact"
        className="desktop:flex-row desktop:items-center flex-col items-stretch"
      >
        <Inline gap="compact" className="flex-1 items-start">
          <Icon icon={glyph} className="text-ink-2" />
          <div className="min-w-0">
            <div className={textRole('body', 'truncate')}>{title}</div>
            <div className="type-caption">{status}</div>
          </div>
        </Inline>
        {action ? <Inline className="max-w-full shrink-0 flex-wrap">{action}</Inline> : null}
      </Inline>
      {children}
    </Stack>
  );
}

/**
 * The caller's "Connect …" title only while a required source is unconnected;
 * a connected one names its own next step instead.
 */
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

/** Google's Connect is the named action (3.1); Bing's has its own name. */
function ConnectButton({
  family,
  onConnect,
}: Readonly<{ family: GrantFamily; onConnect: () => void }>) {
  if (family === 'google') return <ActionButton action="connectGoogle" onClick={onConnect} />;
  return (
    <Button variant="secondary" onClick={onConnect}>
      <Icon icon={Plug} />
      Connect {FAMILY_META[family].title}
    </Button>
  );
}

/** Not yet connected: one consent for the family's sources. */
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
          <ConnectButton family={family} onConnect={() => startConnect(family)} />
        ) : (
          <span className="type-caption">Ask a workspace owner or admin</span>
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
          <Inline as="span" gap="meta" className="min-w-0">
            {/* A GA4 property is a number; a Search Console property is a site. */}
            {step.connection.provider === 'ga4' ? (
              <InlineFigure>{step.mapping.property_ref}</InlineFigure>
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
        <p className="type-caption">Ask a workspace owner or admin to choose it.</p>
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

/** Connected, no property yet: the choice's buttons at the row's end, its list under it. */
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

/**
 * The families still to connect when every source answered as unconnected and
 * the callback has nothing to report; otherwise null.
 */
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

/** Nothing connected yet: the page's empty state, with each family's Connect. */
function UnconnectedState({
  heading,
  icon,
  families,
  canManage,
  startConnect,
}: Readonly<{
  heading: string;
  icon?: LucideIcon;
  families: readonly GrantFamily[];
  canManage: boolean;
  startConnect: (family: GrantFamily) => void;
}>) {
  const [lead, ...rest] = families;
  const action =
    canManage && lead ? (
      <>
        <ConnectButton family={lead} onConnect={() => startConnect(lead)} />
        {rest.slice(0, 1).map((family) => (
          <Button key={family} variant="quiet" onClick={() => startConnect(family)}>
            <Icon icon={Plug} />
            Connect {FAMILY_META[family].title}
          </Button>
        ))}
      </>
    ) : (
      <span className="type-caption">Ask a workspace owner or admin to connect it.</span>
    );
  return <StateBlock kind="empty" icon={icon} heading={heading} action={action} />;
}

/**
 * Connect a data source without leaving the screen that needs it.
 *
 * Each source shows only its next step: Connect (one Google consent covers
 * Search Console and Analytics), Reconnect, or choose the property — with the
 * property that belongs to this project offered as a single click. Consent
 * returns here rather than to Settings, and choosing a property starts the
 * history import at once.
 *
 * Renders nothing once every `required` source imports into the project, so a
 * screen can keep it mounted; `optional` sources are offered alongside while
 * setup is still incomplete.
 */
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
  /** Shown in place of the setup card once every required source is ready. */
  whenReady?: ReactNode;
  /**
   * The page's own empty state while no source is connected at all: the first
   * family's Connect leads, a second family's is the quiet supporting action.
   */
  unconnected?: Readonly<{ heading: string; icon?: LucideIcon }>;
}>) {
  const { activeProject, activeWorkspaceId } = useProjectContext();
  const canManage = useWorkspaceCapability('manage_credentials');
  const location = useLocation();
  const [params] = useSearchParams();
  const providers = [...required, ...optional];
  const sources = useDataSources(activeWorkspaceId, activeProject?.id ?? null, providers);
  const oauth = useOAuthReturn();

  // Until the reads answer, no source is known to be missing: claim nothing.
  if (!activeProject || !activeWorkspaceId || sources.loading) return null;
  const allReady = required.every((provider) => sources.steps.get(provider)?.kind === 'ready');
  if (!sources.error && allReady && !oauth.error) return whenReady;

  // The callback params were already stripped from the address on return.
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

/** The setup card: what the callback reported, then each source's next step. */
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
    // At the prose width, so a row's Connect button sits close to its text.
    <Section
      data-testid="data-source-setup"
      className="mx-auto w-full max-w-[var(--container-prose)]"
    >
      <SectionHeader>
        <SectionTitle>
          {sources.error ? 'Data sources' : setupTitle(required, sources.steps, title)}
        </SectionTitle>
      </SectionHeader>
      <Stack gap="compact">
        {oauth.error ? <Notice tone="negative">{oauthErrorMessage(oauth.error)}</Notice> : null}
        {oauth.connected ? (
          <Notice tone="positive">{FAMILY_META[oauth.connected].title} connected.</Notice>
        ) : null}
        {sources.error ? (
          <Notice
            kind="read"
            title="Couldn't load your data sources"
            error={sources.error}
            fallback="Couldn't load your data sources. Check your connection and try again."
            onRetry={sources.retry}
          />
        ) : (
          // A failed read knows no source's step, so no row is guessed from it.
          <ul className={ledgerClasses()}>
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
          </ul>
        )}
      </Stack>
    </Section>
  );
}
