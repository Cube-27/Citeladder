'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { ContentLink, ContentStructure } from '@citeladder/contracts/site-health';

import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ReadError } from '@/components/ui/read-error';
import { Select } from '@/components/ui/select';
import { TabsBar, TabsRoot, TabPanel } from '@/components/ui/tabs';
import {
  contentStructureApi,
  contentStructureQuery,
} from '@/lib/api/site-health-content-structure';
import { httpErrorStatus, humanizeApiError } from '@/lib/api/errors';
import { downloadCsv } from '@/lib/csv/download';
import { ICONS } from '@/lib/icons';
import { RERUN_POLL_INTERVAL_MS } from '@/lib/config/site-health';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { ContentLinkReview } from './content-link-review';
import { ContentLinksTable, ContentTopics } from './content-structure-views';

type Scope = Readonly<{ projectId: string; workspaceId: string }>;
type SavedRead = Awaited<ReturnType<typeof contentStructureApi.read>>;
type ParamChange = (key: string, value: string) => void;
const isRunning = (state: string | undefined) => state === 'queued' || state === 'running';

export function ContentStructureScreen() {
  const { activeProject, activeWorkspaceId } = useProjectContext();
  if (!activeProject || !activeWorkspaceId)
    return (
      <PageShell>
        <p className="type-body">Select a project to inspect its content.</p>
      </PageShell>
    );
  return (
    <ContentStructureContent
      key={`${activeWorkspaceId}:${activeProject.id}`}
      projectId={activeProject.id}
      workspaceId={activeWorkspaceId}
    />
  );
}

function useContentAnalysis(scope: Scope, analysisId: string | undefined, update: ParamChange) {
  const { projectId, workspaceId } = scope;
  const queryClient = useQueryClient();
  const options = contentStructureQuery(workspaceId, projectId, analysisId);
  const query = useQuery({
    ...options,
    refetchInterval: (current) =>
      isRunning(current.state.data?.analysis?.state) ? RERUN_POLL_INTERVAL_MS : false,
  });
  const denied = [401, 403, 404].includes(httpErrorStatus(query.error) ?? 0);
  const data = denied ? undefined : query.data;
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const analyze = useMutation({
    mutationFn: () =>
      contentStructureApi.analyze(
        projectId,
        { crawl_id: data!.crawl_id!, idempotency_key: requestKey },
        { workspaceId },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(options.queryKey, result);
      setRequestKey(crypto.randomUUID());
      if (!result.analysis) return;
      // Seed the selected-analysis key so the URL change does not flash a reload.
      queryClient.setQueryData(
        contentStructureQuery(workspaceId, projectId, result.analysis.id).queryKey,
        result,
      );
      update('analysis', result.analysis.id);
    },
  });
  const cancel = useMutation({
    mutationFn: () => contentStructureApi.cancel(projectId, data!.analysis!.id, { workspaceId }),
    onSuccess: (result) => queryClient.setQueryData(options.queryKey, result),
  });
  return { data, query, denied, analyze, cancel };
}
type AnalysisRead = ReturnType<typeof useContentAnalysis>;

function filteredLinks(analysis: ContentStructure | null | undefined, params: URLSearchParams) {
  const topic = analysis?.topics.find((item) => item.id === params.get('topic'));
  const status = params.get('status');
  const search = (params.get('q') ?? '').toLocaleLowerCase();
  return (analysis?.recommendations ?? []).filter(
    (link) =>
      (!topic || topic.recommendation_ids.includes(link.id)) &&
      (!status || link.action_status === status) &&
      `${link.source.title} ${link.source.url} ${link.target.title} ${link.target.url} ${link.anchor.text}`
        .toLocaleLowerCase()
        .includes(search),
  );
}

function ContentStructureContent(scope: Scope) {
  const [params, setParams] = useSearchParams();
  const update: ParamChange = (key, value) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key === 'analysis') {
        next.delete('topic');
        next.delete('recommendation');
      }
      return next;
    });
  const read = useContentAnalysis(scope, params.get('analysis') || undefined, update);
  const analysis = read.data?.analysis;
  const links = filteredLinks(analysis, params);
  const view = params.get('view') === 'topics' ? 'topics' : 'links';
  const selected = analysis?.recommendations.find(
    (link) => link.id === params.get('recommendation'),
  );
  return (
    <TabsRoot value={view} onValueChange={(value) => update('view', value)}>
      <PageShell
        actions={<AnalysisActions read={read} />}
        tabs={
          <TabsBar
            variant="band"
            ariaLabel="Content structure views"
            items={[
              { value: 'links', label: 'Internal links' },
              { value: 'topics', label: 'Topics' },
            ]}
          />
        }
        controls={
          <ContentControls data={read.data} links={links} params={params} update={update} />
        }
      >
        <div className="space-y-6">
          <ReadNotices read={read} />
          {analysis ? (
            <AnalysisResult
              analysis={analysis}
              links={links}
              topicId={params.get('topic') ?? ''}
              update={update}
            />
          ) : (
            <StartState data={read.data} />
          )}
        </div>
        {analysis ? (
          <ContentLinkReview
            link={selected}
            links={analysis.recommendations}
            workspaceId={scope.workspaceId}
            crawlId={analysis.crawl_id}
            stale={analysis.stale}
            onClose={() => update('recommendation', '')}
          />
        ) : null}
      </PageShell>
    </TabsRoot>
  );
}

function AnalysisActions({ read }: Readonly<{ read: AnalysisRead }>) {
  const canRun = useWorkspaceCapability('run');
  if (!canRun || read.denied) return null;
  if (isRunning(read.data?.analysis?.state))
    return (
      <Button
        variant="secondary"
        pending={read.cancel.isPending}
        onClick={() => read.cancel.mutate()}
      >
        Cancel analysis
      </Button>
    );
  return (
    <Button
      disabled={!read.data?.crawl_id || read.query.isError}
      pending={read.analyze.isPending}
      onClick={() => read.analyze.mutate()}
    >
      {read.data?.analysis ? 'Analyze again' : 'Analyze content'}
    </Button>
  );
}

function ContentControls({
  data,
  links,
  params,
  update,
}: Readonly<{
  data: SavedRead | undefined;
  links: ContentLink[];
  params: URLSearchParams;
  update: ParamChange;
}>) {
  if (!data?.analysis) return null;
  return (
    <>
      {data.history.length > 1 ? (
        <Select
          ariaLabel="Saved analysis"
          value={data.analysis.id}
          onValueChange={(value) => update('analysis', value)}
          options={data.history.map((run, index) => ({
            value: run.id,
            label: `Analysis ${data.history.length - index} · ${run.state}`,
          }))}
        />
      ) : null}
      <Input
        aria-label="Search pages and anchors"
        placeholder="Search pages and anchors"
        value={params.get('q') ?? ''}
        onChange={(event) => update('q', event.target.value)}
      />
      <Select
        ariaLabel="Filter by topic"
        value={params.get('topic') ?? ''}
        onValueChange={(value) => update('topic', value)}
        options={[
          { value: '', label: 'All topics' },
          ...data.analysis.topics.map((item) => ({ value: item.id, label: item.label })),
        ]}
      />
      <Select
        ariaLabel="Action status"
        value={params.get('status') ?? ''}
        onValueChange={(value) => update('status', value)}
        options={[
          { value: '', label: 'All Action statuses' },
          { value: 'open', label: 'Open' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'implemented', label: 'Implemented' },
          { value: 'measuring', label: 'Measuring' },
          { value: 'done', label: 'Done' },
          { value: 'dismissed', label: 'Dismissed' },
        ]}
      />
      {links.length ? (
        <Button
          variant="secondary"
          onClick={() =>
            downloadCsv(
              'internal-links',
              ['Source', 'Destination', 'Anchor', 'Passage'],
              links.map((link) => [
                link.source.url,
                link.target.url,
                link.anchor.text,
                link.passage.text,
              ]),
            )
          }
        >
          Export
        </Button>
      ) : null}
    </>
  );
}

function ReadNotices({ read }: Readonly<{ read: AnalysisRead }>) {
  const mutationError = read.analyze.error || read.cancel.error;
  return (
    <>
      {read.query.isError ? (
        <ReadError
          error={read.query.error}
          fallback="Content structure could not be loaded."
          onRetry={() => void read.query.refetch()}
        />
      ) : null}
      {mutationError ? (
        <Alert>{humanizeApiError(mutationError, 'Analysis could not be started.').message}</Alert>
      ) : null}
      {read.query.isPending ? (
        <output className="type-body">Loading content structure…</output>
      ) : null}
    </>
  );
}

function StartState({ data }: Readonly<{ data: SavedRead | undefined }>) {
  if (!data) return null;
  if (data.crawl_id)
    return (
      <EmptyState
        icon={ICONS.site}
        heading="Find useful connections between your pages"
        description="Analyze captured content to review internal links and browse topic groups."
      />
    );
  return (
    <EmptyState
      icon={ICONS.site}
      heading="Start with a website crawl"
      description="A completed crawl provides the page content and existing links for analysis."
      action={
        <Button asChild>
          <ProjectLink href="/site">Open Website</ProjectLink>
        </Button>
      }
    />
  );
}

function AnalysisResult({
  analysis,
  links,
  topicId,
  update,
}: Readonly<{
  analysis: ContentStructure;
  links: ContentLink[];
  topicId: string;
  update: ParamChange;
}>) {
  if (isRunning(analysis.state))
    return <output className="type-body">Checking contextual links and topic groups…</output>;
  if (['unavailable', 'failed', 'cancelled'].includes(analysis.state))
    return (
      <EmptyState
        icon={ICONS.site}
        heading={analysis.state === 'cancelled' ? 'Analysis cancelled' : 'Analysis unavailable'}
        description="Saved crawl evidence is unchanged; you can start another analysis when service and credit availability are restored."
      />
    );
  return (
    <>
      <p className="type-caption">
        {analysis.page_count} pages · <DisplayTime value={analysis.created_at} dateOnly /> ·{' '}
        {analysis.omitted_pages} pages outside this analysis
      </p>
      {analysis.stale ? (
        <Alert tone="warning">
          These suggestions use an earlier crawl. Analyze the latest crawl before making edits.
        </Alert>
      ) : null}
      {analysis.state === 'partial' ? (
        <Alert tone="info">
          Analysis is incomplete. These suggestions cover only the content that could be assessed.
        </Alert>
      ) : null}
      <TabPanel value="links">
        <ContentLinksTable links={links} onSelect={(id) => update('recommendation', id)} />
      </TabPanel>
      <TabPanel value="topics">
        <ContentTopics
          analysis={analysis}
          links={links}
          selectedId={topicId}
          onSelect={(id) => update('topic', id)}
          onReview={(id) => update('recommendation', id)}
        />
      </TabPanel>
    </>
  );
}
