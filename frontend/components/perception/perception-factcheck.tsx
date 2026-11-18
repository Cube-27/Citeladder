import type { AccuracyResponse } from '@citeladder/contracts/fact-checking';
import { Download, Upload } from 'lucide-react';
import { useState } from 'react';

import { ClaimsOverTime } from '@/components/perception/claims-over-time';
import { ClaimsTable } from '@/components/perception/claims-table';
import { FactsImportDialog } from '@/components/perception/facts-import-dialog';
import { FactsTable } from '@/components/perception/facts-table';
import { Button, buttonClasses } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { humanizeApiError } from '@/lib/api/errors';
import { DisplayTime } from '@/components/ui/display-time';
import { Inline, Stack } from '@/components/ui/layout';
import { ProjectLink } from '@/components/ui/project-link';
import { textRole } from '@/components/ui/typography';
import { AnalysisRead } from '@/components/visibility/selection-gate';
import { AccuracyView } from '@/components/visibility/visibility-accuracy';
import type { useAccuracy, useFactViews } from '@/lib/visibility/use-accuracy';

type FactViews = ReturnType<typeof useFactViews>;

/**
 * The Perception page's Fact-checking tab (pilot only): the accuracy view
 * under its lede, the claims per run, every claim with its verdict, and the
 * claims by frozen fact.
 */
export function PerceptionFactChecking({
  query,
  views,
}: Readonly<{ query: ReturnType<typeof useAccuracy>; views: FactViews }>) {
  return (
    <AnalysisRead
      query={query}
      title="Couldn't load the fact checks"
      busyLabel="Updating fact checks"
      busy={query.isFetching}
      ready={query.data}
    >
      {(data) => (
        <AccuracyView
          data={data}
          lede={<FactCheckingLede data={data} exporting={views.exporting} />}
          trend={<ClaimsOverTime trend={data.trend} />}
          allClaims={<ClaimsTable views={views} />}
          byFact={<FactsTable query={views.facts} />}
        />
      )}
    </AnalysisRead>
  );
}

function contradictedHeadline(count: number) {
  if (count === 0) return 'Your facts contradict no claim AI made';
  return `Your facts contradict ${count} ${count === 1 ? 'claim' : 'claims'} AI made`;
}

function FactCheckingLede({
  data,
  exporting,
}: Readonly<{ data: AccuracyResponse; exporting: FactViews['exporting'] }>) {
  const { notify } = useToast();
  const [importing, setImporting] = useState(false);
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
      <Inline gap="item" className="shrink-0">
        <ProjectLink href="/agent/context?tab=brand-facts" className={buttonClasses('secondary')}>
          Edit facts
        </ProjectLink>
        <Button variant="secondary" onClick={() => setImporting(true)}>
          <Icon icon={Upload} />
          Import facts CSV
        </Button>
        <FactsImportDialog open={importing} onOpenChange={setImporting} />
        <Button
          variant="secondary"
          pending={exporting.isPending}
          onClick={() =>
            exporting.mutate(undefined, {
              onError: (error) =>
                notify("Couldn't export the claims", humanizeApiError(error).message, {
                  tone: 'negative',
                }),
            })
          }
        >
          <Icon icon={Download} />
          Export claims CSV
        </Button>
      </Inline>
    </Inline>
  );
}
