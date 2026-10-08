'use client';

import { useMutation } from '@tanstack/react-query';
import { BarChart3, Globe, Search, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { BackfillProgress } from '@/components/settings/backfill-progress';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { humanizeApiError } from '@/lib/api/errors';
import {
  integrationsApi,
  type IntegrationConnection,
  type IntegrationProperty,
  type IntegrationProvider,
} from '@/lib/api/integrations';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { projectDestination } from '@/lib/navigation/project-destination';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

import {
  oauthErrorMessage,
  useDataSources,
  useRefreshAfterMapping,
  type SourceStep,
} from './data-sources';

type Family = 'google' | 'microsoft';

const SOURCE: Record<
  IntegrationProvider,
  { label: string; noun: string; console: string; family: Family; Icon: LucideIcon }
> = {
  gsc: {
    label: 'Google Search Console',
    noun: 'Search Console property',
    console: 'Search Console',
    family: 'google',
    Icon: Search,
  },
  ga4: {
    label: 'Google Analytics 4',
    noun: 'Analytics property',
    console: 'Google Analytics',
    family: 'google',
    Icon: BarChart3,
  },
  bing: {
    label: 'Bing Webmaster Tools',
    noun: 'Bing site',
    console: 'Bing Webmaster Tools',
    family: 'microsoft',
    Icon: Globe,
  },
};

const FAMILY_NAME: Record<Family, string> = { google: 'Google', microsoft: 'Bing' };
/** The provider whose consent starts each family's grant. */
const FAMILY_START: Record<Family, IntegrationProvider> = { google: 'gsc', microsoft: 'bing' };

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
  const refresh = useRefreshAfterMapping();
  useEffect(() => {
    if (!result.connected && !result.error) return;
    if (result.connected) void refresh();
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('connected');
        next.delete('error');
        return next;
      },
      { replace: true },
    );
  }, [refresh, result, setParams]);
  const connected =
    result.connected === 'gsc' || result.connected === 'ga4' || result.connected === 'bing'
      ? SOURCE[result.connected].family
      : null;
  return { connected, error: result.error };
}

type Row =
  | { kind: 'connect'; family: Family; providers: IntegrationProvider[] }
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
    const family = SOURCE[provider].family;
    const existing = rows.find(
      (row): row is Extract<Row, { kind: 'connect' }> =>
        row.kind === 'connect' && row.family === family,
    );
    if (existing) existing.providers.push(provider);
    else rows.push({ kind: 'connect', family, providers: [provider] });
  }
  return rows;
}

function joinLabels(providers: readonly IntegrationProvider[]): string {
  return providers.map((provider) => SOURCE[provider].label).join(' and ');
}

function RowFrame({
  Icon,
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
    <li className="border-border-subtle grid gap-3 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden
            className="bg-well border-border text-secondary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border"
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className={textRole('itemTitle', 'truncate')}>{title}</div>
            <div className="type-caption">{status}</div>
          </div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </li>
  );
}

/** Properties that belong to the project first; the provider's order otherwise. */
function suggestedProperty(provider: IntegrationProvider, properties: IntegrationProperty[]) {
  const matching = properties.filter((property) => property.matches_project === true);
  if (matching.length === 1) return matching[0]!;
  // GA4 exposes no site to match, so a single property is the only safe suggestion.
  if (provider === 'ga4' && properties.length === 1) return properties[0]!;
  return null;
}

function PropertyChoice({
  provider,
  connection,
  projectId,
  autoStart,
}: Readonly<{
  provider: IntegrationProvider;
  connection: IntegrationConnection;
  projectId: string;
  autoStart: boolean;
}>) {
  const source = SOURCE[provider];
  const refresh = useRefreshAfterMapping();
  const [showAll, setShowAll] = useState(false);
  const discovery = useMutation({
    mutationFn: () =>
      integrationsApi.discoverProperties(connection.id, projectId, {
        workspaceId: connection.workspace_id,
      }),
    retry: false,
  });
  const select = useMutation({
    mutationFn: (propertyRef: string) =>
      integrationsApi.createMapping(
        connection.id,
        { provider, property_ref: propertyRef, project_id: projectId },
        { workspaceId: connection.workspace_id },
      ),
    onSuccess: () => refresh(),
  });
  // Returning from consent, the list is what the user came back for.
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    discovery.mutate();
  }, [autoStart, discovery]);

  if (discovery.isIdle)
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={() => discovery.mutate()}>
          Choose {source.noun}
        </Button>
      </div>
    );
  if (discovery.isPending)
    return (
      <output className="type-caption flex items-center gap-2">
        <Spinner size="sm" /> Loading your {source.noun}s…
      </output>
    );
  if (discovery.isError)
    return (
      <Alert tone="danger">
        Could not load your {source.noun}s. {humanizeApiError(discovery.error).message}{' '}
        <Button variant="ghost" size="sm" onClick={() => discovery.mutate()}>
          Try again
        </Button>
      </Alert>
    );
  const properties = [...(discovery.data ?? [])].sort(
    (a, b) => Number(b.matches_project === true) - Number(a.matches_project === true),
  );
  if (properties.length === 0)
    return (
      <Alert tone="neutral">
        This account has no {source.noun}. Add and verify the site in {source.console}, then{' '}
        <Button variant="ghost" size="sm" onClick={() => discovery.mutate()}>
          check again
        </Button>
      </Alert>
    );
  const suggested = suggestedProperty(provider, properties);
  const listed = suggested && !showAll ? [] : properties;
  return (
    <div className="grid gap-2">
      {suggested ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => select.mutate(suggested.property_ref)}
            pending={select.isPending && select.variables === suggested.property_ref}
            pendingLabel="Importing…"
            disabled={select.isPending}
            aria-label={`Use ${suggested.label} for ${source.label}`}
          >
            Use {suggested.label}
          </Button>
          {properties.length > 1 && !showAll ? (
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              Choose another
            </Button>
          ) : null}
        </div>
      ) : null}
      {listed.length ? (
        <ul className="grid gap-1" aria-label={`${source.noun}s`}>
          {listed.map((property) => {
            const foreign = property.matches_project === false;
            return (
              <li key={property.property_ref} className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className={textRole('label', 'block truncate')}>{property.label}</span>
                  <span className="type-caption block truncate">
                    {foreign ? 'Belongs to a different site' : property.property_ref}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={foreign || select.isPending}
                  pending={select.isPending && select.variables === property.property_ref}
                  pendingLabel="Importing…"
                  onClick={() => select.mutate(property.property_ref)}
                  aria-label={`Use ${property.label} for ${source.label}`}
                >
                  Use
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {select.isError ? (
        <Alert tone="danger">{humanizeApiError(select.error).message}</Alert>
      ) : null}
    </div>
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
  startConnect: (family: Family) => void;
}>) {
  const source = SOURCE[provider];
  if (step.kind === 'reconnect')
    return (
      <RowFrame
        Icon={source.Icon}
        title={source.label}
        status={`${FAMILY_NAME[source.family]} needs your consent again. Imported data is kept.`}
        action={
          canManage ? (
            <Button size="sm" onClick={() => startConnect(source.family)}>
              Reconnect {FAMILY_NAME[source.family]}
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
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular-nums">{step.mapping.property_ref}</span>
            <BackfillProgress
              workspaceId={step.connection.workspace_id}
              connectionId={step.connection.id}
            />
          </span>
        }
      />
    );
  return (
    <RowFrame
      Icon={source.Icon}
      title={source.label}
      status={`Connected. Choose the ${source.noun} for this project.`}
    >
      {canManage ? (
        <PropertyChoice
          provider={provider}
          connection={step.connection}
          projectId={projectId}
          autoStart={autoStart}
        />
      ) : (
        <p className="type-caption">Ask a workspace owner or admin to choose it.</p>
      )}
    </RowFrame>
  );
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
  description,
}: Readonly<{
  required: readonly IntegrationProvider[];
  optional?: readonly IntegrationProvider[];
  title: string;
  description: string;
}>) {
  const { activeProject, activeWorkspaceId } = useProjectContext();
  const canManage = useWorkspaceCapability('manage_credentials');
  const location = useLocation();
  const [params] = useSearchParams();
  const providers = [...required, ...optional];
  const sources = useDataSources(activeWorkspaceId, activeProject?.id ?? null, providers);
  const oauth = useOAuthReturn();

  if (!activeProject || !activeWorkspaceId) return null;
  const allReady = required.every((provider) => sources.steps.get(provider)?.kind === 'ready');
  if (!sources.loading && !sources.error && allReady && !oauth.error) return null;

  const startConnect = (family: Family) => {
    const back = new URLSearchParams(params);
    back.delete('connected');
    back.delete('error');
    hardNavigate(
      integrationsApi.oauthStartUrl(
        FAMILY_START[family],
        activeWorkspaceId,
        projectDestination(location.pathname, back, activeProject.id),
      ),
    );
  };

  return (
    <Card data-testid="data-source-setup">
      <CardHeader className="grid gap-1">
        <CardTitle>{title}</CardTitle>
        <p className="type-body max-w-[60ch]">{description}</p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {oauth.error ? <Alert tone="danger">{oauthErrorMessage(oauth.error)}</Alert> : null}
        {oauth.connected ? (
          <Alert tone="success">{FAMILY_NAME[oauth.connected]} connected.</Alert>
        ) : null}
        {sources.error ? (
          <ReadError
            error={sources.error}
            fallback="Could not load your data sources. Check your connection and try again."
            onRetry={sources.retry}
          />
        ) : null}
        {sources.loading ? (
          <div className="grid gap-2" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <ul className="grid">
            {setupRows(providers, sources.steps).map((row) =>
              row.kind === 'connect' ? (
                <RowFrame
                  key={`connect-${row.family}`}
                  Icon={SOURCE[row.providers[0]!].Icon}
                  title={joinLabels(row.providers)}
                  status={
                    row.providers.some((provider) => required.includes(provider))
                      ? 'Not connected'
                      : 'Optional'
                  }
                  action={
                    canManage ? (
                      <Button
                        size="sm"
                        variant={
                          row.providers.some((provider) => required.includes(provider))
                            ? 'primary'
                            : 'secondary'
                        }
                        onClick={() => startConnect(row.family)}
                      >
                        Connect {FAMILY_NAME[row.family]}
                      </Button>
                    ) : (
                      <span className="type-caption">Ask a workspace owner or admin</span>
                    )
                  }
                />
              ) : (
                <SourceRow
                  key={row.provider}
                  provider={row.provider}
                  step={row.step}
                  projectId={activeProject.id}
                  canManage={canManage}
                  autoStart={oauth.connected === SOURCE[row.provider].family}
                  startConnect={startConnect}
                />
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
