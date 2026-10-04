'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import type { trafficLegSchema, aiTrafficUrlSchema } from '@citeladder/contracts/ai-traffic';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ReadError } from '@/components/ui/read-error';
import { DisplayTime } from '@/components/ui/display-time';
import { PageLoading } from '@/components/layout/page-loading';
import { aiTrafficApi, type TrafficFilters } from '@/lib/api/ai-traffic';
import { queryKeys } from '@/lib/api/query-keys';
import { useProjectContext } from '@/lib/project/project-context';
import { workspaceDestination } from '@/lib/navigation/project-destination';

export function TrafficLeg({
  leg,
  unit,
}: Readonly<{ leg: z.infer<typeof trafficLegSchema>; unit: string }>) {
  return (
    <span>
      {leg.value === null ? 'Unavailable' : leg.value} {unit} · {leg.state.replaceAll('_', ' ')}
      {leg.coverage ? ' · ' + leg.coverage : ''}
      {leg.reason ? ' · ' + leg.reason.replaceAll('_', ' ') : ''}
    </span>
  );
}
export function UrlPanel({
  urlHash,
  onClose,
  filters = {},
}: Readonly<{ urlHash: string | null; onClose: () => void; filters?: TrafficFilters }>) {
  const { activeProject } = useProjectContext(),
    workspaceId = activeProject?.workspace_id ?? '',
    projectId = activeProject?.id ?? '';
  const query = useQuery({
    queryKey: queryKeys.aiTraffic.view(workspaceId, projectId, 'url', { urlHash, ...filters }),
    queryFn: ({ signal }) =>
      aiTrafficApi.url(projectId, urlHash!, filters, { workspaceId, signal }),
    enabled: !!urlHash && !!workspaceId && !!projectId,
  });
  const data = query.isError ? undefined : query.data,
    page = data?.page;
  return (
    <Drawer
      open={!!urlHash}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={page?.display_path ?? 'Path-level AI Traffic'}
      description="Persisted observations; requests, sessions and citations are separate units."
    >
      {query.isLoading ? <PageLoading label="Loading URL evidence…" /> : null}
      {query.isError ? (
        <ReadError
          error={query.error}
          fallback="Could not read URL evidence"
          onRetry={() => query.refetch()}
        />
      ) : null}
      {data ? <UrlEvidence data={data} projectId={projectId} workspaceId={workspaceId} /> : null}
    </Drawer>
  );
}
function UrlEvidence({
  data,
  projectId,
  workspaceId,
}: Readonly<{
  data: z.infer<typeof aiTrafficUrlSchema>;
  projectId: string;
  workspaceId: string;
}>) {
  const page = data.page;
  if (!page)
    return (
      <Alert tone="info">
        No joinable evidence is available for this path in the selected window.
      </Alert>
    );
  const link = (tab: string) =>
    workspaceDestination(
      '/ai-traffic',
      new URLSearchParams({ tab, project: projectId }),
      workspaceId,
    );
  return (
    <div className="grid gap-4">
      <p className="type-caption">
        {data.window_start} – {data.window_end} · Path-level identity
      </p>
      <p>
        <TrafficLeg leg={page.crawl} unit="requests" /> <Link to={link('crawlers')}>Crawlers</Link>
      </p>
      <p>
        <TrafficLeg leg={page.referrals} unit="AI referral sessions" />{' '}
        <Link to={link('referrals')}>Referrals</Link>
      </p>
      <p>{page.key_events ?? 'Unavailable'} key events as configured in GA4</p>
      <p>
        <TrafficLeg leg={page.citations} unit="tracked citations" />{' '}
        <Link
          to={workspaceDestination(
            '/visibility',
            new URLSearchParams({ project: projectId }),
            workspaceId,
          )}
        >
          Visibility
        </Link>
      </p>
      <p>
        <TrafficLeg leg={page.findings} unit="open Site Health findings" />{' '}
        <Link
          to={workspaceDestination(
            '/site',
            new URLSearchParams({ project: projectId }),
            workspaceId,
          )}
        >
          Site Health
        </Link>
      </p>
      <p className="type-caption">First and last observations in this window</p>
      {data.crawls.map((r) => (
        <p key={r.bot_id}>
          {r.bot_id}: {r.requests} requests · <DisplayTime value={r.first_seen} /> –{' '}
          <DisplayTime value={r.last_seen} />
        </p>
      ))}
      {data.referrals.map((r) => (
        <p key={r.ai_source}>
          {r.ai_source}: first referral {r.first_referral} · {r.sessions} sessions
        </p>
      ))}
      {data.citations.map((r) => (
        <p key={r.citation_id}>Tracked citation: {r.date}</p>
      ))}
      {data.provenance.bounded ? (
        <Alert tone="info">The timeline reached its display bound.</Alert>
      ) : null}
      <p className="type-caption">
        Timeline uses saved crawler rollups, GA4 metric rows and tracked citations.
        {data.provenance.crawl_id ? (
          <Link
            to={workspaceDestination(
              '/site',
              new URLSearchParams({ project: projectId }),
              workspaceId,
            )}
          >
            View Site Health inventory
          </Link>
        ) : (
          ' Inventory unavailable'
        )}
      </p>
    </div>
  );
}
export function TrafficUrlButton({
  urlHash,
  filters = {},
  children = 'View AI Traffic',
}: Readonly<{ urlHash: string; filters?: TrafficFilters; children?: React.ReactNode }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <UrlPanel urlHash={open ? urlHash : null} onClose={() => setOpen(false)} filters={filters} />
    </>
  );
}
