import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { aiTrafficApi } from '@/lib/api/ai-traffic';
import { queryKeys } from '@/lib/api/query-keys';
import { projectDestination } from '@/lib/navigation/project-destination';
import { Alert } from '@/components/ui/alert';
import { ReadError } from '@/components/ui/read-error';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrafficUrlButton } from './url-panel';

export function InsightStrip({
  projectId,
  workspaceId,
  range,
}: Readonly<{ projectId: string; workspaceId: string; range: string }>) {
  const query = useQuery({
    queryKey: queryKeys.aiTraffic.view(workspaceId, projectId, 'insights', { range }),
    queryFn: ({ signal }) => aiTrafficApi.insights(projectId, { range }, { workspaceId, signal }),
    enabled: !!projectId && !!workspaceId,
  });
  const data = query.isError ? undefined : query.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Observed patterns</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {query.isError ? (
          <ReadError
            error={query.error}
            fallback="Could not read insights"
            onRetry={() => query.refetch()}
          />
        ) : null}
        {query.isLoading ? (
          <p className="type-body text-secondary">Loading persisted insights…</p>
        ) : null}
        {data?.coverage.notice ? <Alert tone="info">{data.coverage.notice}</Alert> : null}
        {data ? (
          <p className="type-caption">
            {data.window_start} – {data.window_end} · Co-occurrence only. AI apps can strip
            referrers.
          </p>
        ) : null}
        {data?.patterns.length ? (
          <ul className="divide-border-subtle grid divide-y">
            {data.patterns.map((r) => (
              <li key={r.pattern} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <p className="type-body">{r.copy}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Link
                    className="type-control text-accent-text hover:underline"
                    to={projectDestination(
                      '/ai-traffic',
                      new URLSearchParams({
                        tab: 'pages',
                        range,
                        sort:
                          r.pattern === 'key_event_concentration'
                            ? 'key_events_desc'
                            : 'requests_desc',
                        pattern: r.pattern,
                      }),
                      projectId,
                    )}
                  >
                    Inspect pages
                  </Link>
                  {r.url_hashes.slice(0, 3).map((hash, index) => (
                    <TrafficUrlButton
                      key={hash}
                      urlHash={hash}
                      filters={{ start_date: data.window_start, end_date: data.window_end }}
                    >
                      Inspect page {index + 1}
                    </TrafficUrlButton>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
