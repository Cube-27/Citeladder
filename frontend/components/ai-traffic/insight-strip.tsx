import { useQuery } from '@tanstack/react-query';
import { aiTrafficQueries } from '@/lib/api/ai-traffic';
import { projectDestination } from '@/lib/navigation/project-destination';
import { TextLink } from '@/components/ui/text-link';
import { ClampText } from '@/components/ui/clamp-text';
import { TrafficUrlButton } from './url-panel';
import { patternLabel } from '@/lib/ai-traffic/vocabulary';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import {
  Section,
  SectionBleed,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { Inline, Stack } from '@/components/ui/layout';

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
  return (
    <Section aria-labelledby="observed-patterns">
      <SectionHeader>
        <SectionTitle id="observed-patterns">Observed patterns</SectionTitle>
      </SectionHeader>
      {query.isError ? (
        <StateBlock
          kind="error"
          {...readErrorProps(query)}
          title="Couldn't load the observed patterns"
          fallback="The request failed or timed out."
        />
      ) : null}
      {query.isLoading ? (
        <StateBlock kind="loading" label="Loading observed patterns…" shape={{ kind: 'list' }} />
      ) : null}
      {data && !data.patterns.length ? (
        <StateBlock kind="empty" inline message={data.coverage.notice ?? 'No patterns'} />
      ) : null}
      {data?.patterns.length && data.coverage.notice ? (
        <SectionDescription>{data.coverage.notice}</SectionDescription>
      ) : null}
      {data?.patterns.length ? (
        <SectionBleed as="ul" rows>
          {data.patterns.map((r) => (
            <Stack as="li" key={r.pattern} gap="tight" box="shrink">
              <ClampText phoneWrap text="body">
                {r.copy}
              </ClampText>
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
                    Page {index + 1}
                  </TrafficUrlButton>
                ))}
              </Inline>
            </Stack>
          ))}
        </SectionBleed>
      ) : null}
    </Section>
  );
}
