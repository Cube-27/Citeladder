import type { AccuracyResponse } from '@citeladder/contracts/fact-checking';

import { buttonClasses } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { Inline, Stack } from '@/components/ui/layout';
import { ProjectLink } from '@/components/ui/project-link';
import { textRole } from '@/components/ui/typography';
import { AnalysisRead } from '@/components/visibility/selection-gate';
import { AccuracyView } from '@/components/visibility/visibility-accuracy';
import type { useAccuracy } from '@/lib/visibility/use-accuracy';

/** The Perception page's Fact-checking tab (pilot only): today's Accuracy view under its lede. */
export function PerceptionFactChecking({
  query,
}: Readonly<{ query: ReturnType<typeof useAccuracy> }>) {
  return (
    <AnalysisRead
      query={query}
      title="Couldn't load the fact checks"
      busyLabel="Updating fact checks"
      busy={query.isFetching}
      ready={query.data}
    >
      {(data) => <AccuracyView data={data} lede={<FactCheckingLede data={data} />} />}
    </AnalysisRead>
  );
}

function contradictedHeadline(count: number) {
  if (count === 0) return 'Your facts contradict no claim AI made';
  return `Your facts contradict ${count} ${count === 1 ? 'claim' : 'claims'} AI made`;
}

function FactCheckingLede({ data }: Readonly<{ data: AccuracyResponse }>) {
  const latest = data.trend.at(-1)?.completed_at;
  return (
    <Inline className="items-start justify-between">
      <Stack gap="tight">
        <p className={textRole('caption', 'text-ink-2')}>
          Fact-checking pilot
          {latest ? (
            <>
              {' · latest run '}
              <DisplayTime value={latest} dateOnly />
            </>
          ) : null}
        </p>
        <h2 className={textRole('heading')}>
          {contradictedHeadline(data.score.coverage.contradicted)}
        </h2>
        <p className={textRole('body', 'text-ink-2')}>
          Correct them at the pages AI reads, not in the answer itself.
        </p>
      </Stack>
      <ProjectLink href="/agent/context?tab=brand-facts" className={buttonClasses('secondary')}>
        Edit facts
      </ProjectLink>
    </Inline>
  );
}
