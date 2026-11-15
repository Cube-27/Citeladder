import { useQuery } from '@tanstack/react-query';
import { aiTrafficQueries } from '@/lib/api/ai-traffic';
import { projectDestination } from '@/lib/navigation/project-destination';
import { TextLink } from '@/components/ui/text-link';
import { Inline, Stack } from '@/components/ui/layout';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { TrafficUrlButton } from './url-panel';
import { patternLabel } from '@/lib/ai-traffic/vocabulary';
import { formatWindowDate } from '@/lib/format';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';

/** Nothing observed is a measured absence only when both sources were complete. */
function nothingObservedLine(coverage: Readonly<{ crawl: string; ga4_complete: boolean }>) {
  return coverage.crawl === 'complete' && coverage.ga4_complete
    ? 'No patterns were observed in this window.'
    : 'No patterns were observed in the data covered so far; coverage is incomplete.';
}

export function InsightStrip({
  projectId,
  workspaceId,
  range,
}: Readonly<{ projectId: string; workspaceId: string; range: string }>) {
  const query = useQuery({
    ...aiTrafficQueries.insights({ workspaceId, projectId }, range),
    enabled: !!projectId && !!workspaceId,
  });
  const data = query.isError ? undefined : query.data;
  // The card keeps its slot when nothing was observed: dropping it after the
  // loading line would pull the Overview content up under the reader.
  const nothingObserved = data !== undefined && !data.patterns.length && !data.coverage.notice;
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Observed patterns</SectionTitle>
      </SectionHeader>
      <Stack>
        {query.isError ? (
          <Notice kind="read" {...readErrorProps(query)} fallback="Could not read insights" />
        ) : null}
        {query.isLoading ? (
          <p className="type-body text-ink-2">Loading persisted insights…</p>
        ) : null}
        {nothingObserved ? (
          <p className="type-body text-ink-2">{nothingObservedLine(data.coverage)}</p>
        ) : null}
        {data?.coverage.notice ? <Notice tone="info">{data.coverage.notice}</Notice> : null}
        {data ? (
          <p className="type-caption">
            {formatWindowDate(data.window_start)} – {formatWindowDate(data.window_end)} ·
            Co-occurrence only. AI apps can strip referrers.
          </p>
        ) : null}
        {data?.patterns.length ? (
          <ul className={ledgerClasses()}>
            {data.patterns.map((r) => (
              <Stack as="li" key={r.pattern} className={ledgerItemClasses()}>
                <p className="type-body">{r.copy}</p>
                <Inline gap="meta">
                  <TextLink
                    className="inline-flex min-h-6 items-center"
                    aria-label={`Inspect pages: ${patternLabel(r.pattern)}`}
                    href={projectDestination(
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
                  </TextLink>
                  {r.url_hashes.slice(0, 3).map((hash, index) => (
                    <TrafficUrlButton
                      key={hash}
                      urlHash={hash}
                      label={`Inspect page ${index + 1}: ${patternLabel(r.pattern)}`}
                      filters={{ start_date: data.window_start, end_date: data.window_end }}
                    >
                      Inspect page {index + 1}
                    </TrafficUrlButton>
                  ))}
                </Inline>
              </Stack>
            ))}
          </ul>
        ) : null}
      </Stack>
    </Section>
  );
}
