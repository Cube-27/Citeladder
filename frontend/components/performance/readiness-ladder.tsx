import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { RungTrail, type RungStatus } from '@/components/ui/rung-trail';
import { Text } from '@/components/ui/typography';
import {
  performanceQueries,
  type ProjectReadiness,
  type ProjectReadinessStage,
} from '@/lib/api/performance';
import { RefreshCw } from '@/lib/icons';
import { pollReadiness } from '@/lib/performance/status';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { formatWindowDate } from '@/lib/format';
import { Notice } from '@/components/ui/notice';
import { Section } from '@/components/ui/section';

const LADDER: readonly { stage: ProjectReadinessStage; label: string }[] = [
  { stage: 'connected', label: 'Connected' },
  { stage: 'importing', label: 'Importing history' },
  { stage: 'core_data_ready', label: 'Search data ready' },
  { stage: 'analysis_ready', label: 'Analysis ready' },
] as const;

const EXPLANATION = {
  importing: 'Numbers below are not final.',
  import_failed: 'The history import finished without importing anything.',
} satisfies Partial<Record<ProjectReadinessStage, string>>;

function stageIndex(stage: ProjectReadinessStage): number {
  const index = LADDER.findIndex((step) => step.stage === stage);
  return index;
}

export function useProjectReadiness() {
  const { workspaceId, projectId } = useProjectScope();
  return useQuery({
    ...performanceQueries.readiness({ workspaceId, projectId }),
    refetchInterval: (query) => pollReadiness(query.state.data?.stage),
  });
}

function ladderStepState(index: number, reached: number): RungStatus {
  if (index < reached) return 'done';
  return index === reached ? 'running' : 'pending';
}

export function ReadinessLadder({
  data,
  sync,
}: Readonly<{
  data: ProjectReadiness | undefined;
  sync?: () => void;
}>) {
  if (!data || data.stage === 'analysis_ready' || data.stage === 'not_connected') return null;

  if (data.stage === 'import_failed') {
    return (
      <Notice
        kind="mutation"
        notice={{ message: EXPLANATION.import_failed, retryable: false }}
        recovery={
          sync ? (
            <Button type="button" variant="secondary" onClick={sync}>
              <Icon icon={RefreshCw} />
              Sync again
            </Button>
          ) : undefined
        }
      />
    );
  }

  const reached = stageIndex(data.stage);
  const note = [
    data.stage === 'importing' ? EXPLANATION.importing : null,
    data.imported_through ? `Imported through ${formatWindowDate(data.imported_through)}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Section aria-label="Data readiness" data-testid="readiness-ladder">
      <Stack gap="compact">
        <RungTrail
          orientation="horizontal"
          label="Readiness stages"
          steps={LADDER.map((step, index) => ({
            id: step.stage,
            label: step.label,
            status: ladderStepState(index, reached),
          }))}
        />
        {note ? (
          <Text as="p" variant="caption">
            {note}
          </Text>
        ) : null}
      </Stack>
    </Section>
  );
}
