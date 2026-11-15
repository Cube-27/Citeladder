import { ProjectLink } from '@/components/ui/project-link';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ClampText, TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { Absence } from '@/components/ui/absence';
import type { PromptMetricItem } from '@citeladder/contracts';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate, pluralCount } from '@/lib/format';
import { ANSWER_STATES, competitorGaps, type CompetitorGap } from '@/lib/prompts/history';
import { useEngineCatalog } from '@/lib/providers/engines';
import { StateBlock } from '@/components/ui/state-block';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { FigureStrip } from '@/components/ui/figure-strip';

/**
 * Mentions and citations for one prompt in the latest run that measured it:
 * each answer in one of four states, which engines answered, the competitors
 * named where the brand was not, and the hand-off to the prompt's Action.
 */
export function PromptAnswerStates({ latest }: Readonly<{ latest: PromptMetricItem | null }>) {
  const timeZone = useDisplayTimeZone();
  const actionId = latest?.action_id ?? null;
  const outcomes = latest?.outcomes ?? [];
  const gaps = competitorGaps(outcomes);
  return (
    <>
      <Section>
        <SectionHeader actions={actionId ? <ActionHandoff actionId={actionId} /> : null}>
          <SectionTitle>Mentions and citations</SectionTitle>
          <SectionDescription>
            {latest
              ? `Latest run that measured this prompt, ${formatDisplayDate(latest.created_at, timeZone)}.`
              : 'No run has measured this prompt in this market yet.'}
          </SectionDescription>
        </SectionHeader>
        {latest ? (
          <SectionContent>
            <LatestRun latest={latest} />
          </SectionContent>
        ) : null}
      </Section>
      {outcomes.length ? <EngineTable outcomes={outcomes} /> : null}
      {gaps.length ? <CompetitorGapTable gaps={gaps} /> : null}
    </>
  );
}

function ActionHandoff({ actionId }: Readonly<{ actionId: string }>) {
  return (
    <>
      <Button asChild variant="secondary">
        <ProjectLink href={`/agent/actions/${actionId}`}>Open the Action</ProjectLink>
      </Button>
      <Button asChild variant="primary">
        <ProjectLink href={agentHandoffHref({ actionId })}>Work on this</ProjectLink>
      </Button>
    </>
  );
}

function LatestRun({ latest }: Readonly<{ latest: PromptMetricItem }>) {
  const counts = latest.counts;
  const states = latest.answer_states ?? null;
  const outcomes = latest.outcomes ?? [];
  return (
    <Stack gap="workspace">
      {counts ? (
        <p className="type-caption">
          {counts.responses} of {counts.expected ?? counts.responses} answers succeeded across{' '}
          {pluralCount(outcomes.length, 'engine')}
          {counts.failed ? `; ${counts.failed} failed` : ''}
          {counts.not_run ? `; ${counts.not_run} not run` : ''}.{' '}
          <TextLink href={`/runs/${latest.audit_id}`} text="inherit">
            Read the answers
          </TextLink>
        </p>
      ) : null}
      {states ? (
        <FigureStrip
          label="Answers by state"
          segments={ANSWER_STATES.map((state) => ({
            key: state.key,
            label: state.label,
            value: states[state.key],
            sub: state.meaning,
          }))}
        />
      ) : (
        <StateBlock
          kind="empty"
          inline
          message="No answer succeeded for this prompt in that run, so mentions and citations are unavailable rather than zero."
        />
      )}
      {/* Only a measured, empty gap list is "none"; absent outcomes are unavailable. */}
      {states && latest.outcomes && competitorGaps(latest.outcomes).length === 0 ? (
        <StateBlock
          kind="empty"
          inline
          message="No answer named a tracked competitor while leaving you out."
        />
      ) : null}
    </Stack>
  );
}

const GAP_COLUMNS: readonly DataTableColumn[] = [
  { key: 'competitor', label: 'Competitor' },
  { key: 'answers', label: 'Answers', width: 'figure', numeric: true },
  { key: 'engines', label: 'Engines', width: 'name' },
];

/** Competitors named where the brand was not, most answers first. */
function CompetitorGapTable({ gaps }: Readonly<{ gaps: readonly CompetitorGap[] }>) {
  const engines = useEngineCatalog();
  return (
    <DataTable title="Competitors named without you" columns={GAP_COLUMNS}>
      {gaps.map((gap) => (
        <TableRow key={gap.name}>
          <TableCell>
            <ClampText lines={1}>{gap.name}</ClampText>
          </TableCell>
          <TableCell numeric>{gap.answers}</TableCell>
          <TableCell>{gap.engines.map(engines.label).join(', ')}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

type Outcome = NonNullable<PromptMetricItem['outcomes']>[number];

/** Engine coverage: each engine and model the run asked, its failed answers and its answers by state. */
// The engine leads at a quarter of the table, so "Google AI Overview" holds
// one line at every width; the six counts share the rest evenly.
const ENGINE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'engine', label: 'Engine', width: 'lead' },
  { key: 'answers', label: 'Answers', numeric: true },
  { key: 'failed', label: 'Failed', numeric: true },
  ...ANSWER_STATES.map((state): DataTableColumn => ({
    key: state.key,
    label: state.label,
    numeric: true,
  })),
];

function EngineTable({ outcomes }: Readonly<{ outcomes: readonly Outcome[] }>) {
  const engines = useEngineCatalog();
  return (
    <DataTable title="Engine coverage" columns={ENGINE_COLUMNS}>
      {outcomes.map((outcome) => (
        <TableRow key={`${outcome.logical_engine}:${outcome.transport_model}`}>
          {/* A row is one engine AND model, so the model is named under the
              engine: two models of one engine no longer read as a repeat. */}
          <TableCell>
            <TableCellLines
              primary={engines.label(outcome.logical_engine)}
              secondary={engines.modelLabel(outcome.logical_engine, outcome.transport_model)}
            />
          </TableCell>
          <TableCell numeric>{outcome.counts.responses}</TableCell>
          {/* An engine whose every answer failed keeps its row, read as failed. */}
          <TableCell numeric>{outcome.counts.failed ?? <Absence state="not_measured" />}</TableCell>
          {ANSWER_STATES.map((state) => (
            <TableCell key={state.key} numeric>
              {outcome.answer_states ? (
                outcome.answer_states[state.key]
              ) : (
                <Absence state="not_measured" />
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </DataTable>
  );
}
