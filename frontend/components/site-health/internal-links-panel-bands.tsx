'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { InternalLink, InternalLinkAnalysis } from '@citeladder/contracts/site-health';

import { RESERVED_CONTROLS } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { FilterField, type FilterBarProps } from '@/components/ui/filter-bar';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { ACTION_STATUS_LABEL } from '@/lib/agent/vocabulary';
import { httpErrorStatus } from '@/lib/api/errors';
import { internalLinksMutations, internalLinksQueries } from '@/lib/api/site-health-internal-links';
import type { UrlHistory } from '@/lib/navigation/url-state';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayTimestamp } from '@/lib/format';
import { downloadInternalLinksCsv } from '@/lib/site-health/internal-link-csv';
import { INTERNAL_LINK_STATES, pollInternalLinks } from '@/lib/site-health/status';
import { useWorkspaceCapability } from '@/lib/project/project-context';

type Scope = Readonly<{ projectId: string; workspaceId: string }>;
type ParamChange = (key: string, value: string, history?: UrlHistory) => void;
export const isRunning = (state: InternalLinkAnalysis['state']) =>
  INTERNAL_LINK_STATES[state].active;

/** The Internal links tab's address: the saved analysis, the search and the status filter. */
export function useLinkParams() {
  const [params, setParams] = useSearchParams();
  const update: ParamChange = (key, value, history = 'push') =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key === 'analysis') next.delete('link');
        return next;
      },
      { replace: history === 'replace' },
    );
  return { params, update };
}

/**
 * The tab's read and its run/cancel mutations. The screen owns it, because
 * the page header (Export, Analyze again) and the control band (search,
 * status, saved analysis) act on the same analysis the panel draws.
 */
function useInternalLinks(scope: Scope, enabled: boolean) {
  const { params, update } = useLinkParams();
  const analysisId = params.get('analysis') || undefined;
  const query = useQuery({
    ...internalLinksQueries.analysis(scope, analysisId),
    enabled,
    refetchInterval: (current) => pollInternalLinks(current.state.data?.analysis?.state),
  });
  const denied = [401, 403, 404].includes(httpErrorStatus(query.error) ?? 0);
  const data = denied ? undefined : query.data;
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const analyze = useMutation(internalLinksMutations.analyze(scope));
  const cancel = useMutation(internalLinksMutations.cancel(scope, analysisId));
  const startAnalysis = () =>
    analyze.mutate(
      { crawl_id: data!.crawl_id!, idempotency_key: requestKey },
      {
        onSuccess: (result) => {
          setRequestKey(crypto.randomUUID());
          if (result.analysis) update('analysis', result.analysis.id);
        },
      },
    );
  const cancelAnalysis = () => cancel.mutate(data!.analysis!.id);
  return { data, query, analyze, cancel, startAnalysis, cancelAnalysis };
}
export type LinksRead = ReturnType<typeof useInternalLinks>;

export function filterLinks(links: InternalLink[], search: string, status: string) {
  const needle = search.toLocaleLowerCase();
  return links.filter(
    (link) =>
      (!status || (link.action_status ?? '') === status) &&
      `${link.source.title} ${link.source.url} ${link.target.title} ${link.target.url} ${link.anchor}`
        .toLocaleLowerCase()
        .includes(needle),
  );
}

/**
 * Internal links' share of the page bands: the read the panel draws, the
 * header's actions (Export and the one primary, Analyze again) and the
 * control band (search, status, saved analysis). `enabled` is false on every
 * other tab, so nothing is read there.
 */
export function useInternalLinksBands({
  scope,
  enabled,
  canAnalyze = true,
}: Readonly<{
  scope: Scope;
  enabled: boolean;
  /** False while the screen withholds mutations: the export stays, the run does not. */
  canAnalyze?: boolean;
}>): Readonly<{
  read: LinksRead;
  actions: ReactNode;
  controls: FilterBarProps | undefined;
}> {
  const read = useInternalLinks(scope, enabled);
  const { params, update } = useLinkParams();
  const analysis = read.data?.analysis;
  const links = filterLinks(
    analysis?.recommendations ?? [],
    params.get('links_q') ?? '',
    params.get('links_status') ?? '',
  );
  return {
    read,
    actions: analysis ? (
      <LinksActions read={read} links={links} analysis={analysis} canAnalyze={canAnalyze} />
    ) : null,
    controls: linksControls(read, params, update),
  };
}

function linksControls(
  read: LinksRead,
  params: URLSearchParams,
  update: ParamChange,
): FilterBarProps | undefined {
  // The first read holds the band, so the table starts on the same line once it lands.
  if (read.query.isPending) return RESERVED_CONTROLS;
  const data = read.data;
  if (!data?.analysis) return undefined;
  return {
    search: (
      <SearchField
        value={params.get('links_q') ?? ''}
        onValueChange={(value) => update('links_q', value, 'replace')}
        placeholder="Search pages and anchors"
        aria-label="Search pages and anchors"
      />
    ),
    filters: (
      <>
        <FilterField>
          <Select
            ariaLabel="Action status"
            value={params.get('links_status') ?? ''}
            onValueChange={(value) => update('links_status', value)}
            options={[
              { value: '', label: 'All statuses' },
              ...Object.entries(ACTION_STATUS_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterField>
        <SavedAnalysis history={data.history} analysisId={data.analysis.id} update={update} />
      </>
    ),
  };
}

function SavedAnalysis({
  history,
  analysisId,
  update,
}: Readonly<{
  history: NonNullable<LinksRead['data']>['history'];
  analysisId: string;
  update: ParamChange;
}>) {
  const timeZone = useDisplayTimeZone();
  if (history.length < 2) return null;
  return (
    <FilterField>
      <Select
        ariaLabel="Saved analysis"
        value={analysisId}
        onValueChange={(value) => update('analysis', value)}
        options={history.map((run) => ({
          value: run.id,
          label: `${formatDisplayTimestamp(run.created_at, timeZone)} · ${INTERNAL_LINK_STATES[run.state].label}`,
        }))}
      />
    </FilterField>
  );
}

/** The tab's header actions: the links export, then run or cancel. */
function LinksActions({
  read,
  links,
  analysis,
  canAnalyze,
}: Readonly<{
  read: LinksRead;
  links: InternalLink[];
  analysis: InternalLinkAnalysis;
  canAnalyze: boolean;
}>) {
  const canRun = useWorkspaceCapability('run') && canAnalyze;
  const running = isRunning(analysis.state);
  let run: ReactNode = null;
  if (canRun && running)
    run = (
      <Button variant="secondary" pending={read.cancel.isPending} onClick={read.cancelAnalysis}>
        Cancel analysis
      </Button>
    );
  else if (canRun)
    run = (
      <Button
        variant="primary"
        disabled={!read.data?.crawl_id || read.query.isError}
        pending={read.analyze.isPending}
        onClick={read.startAnalysis}
      >
        Analyze again
      </Button>
    );
  return (
    <>
      {/* Held while the filters match nothing, so the header never reflows. */}
      <Button
        variant="secondary"
        disabled={!links.length}
        onClick={() => downloadInternalLinksCsv(links)}
      >
        Export
      </Button>
      {run}
    </>
  );
}
