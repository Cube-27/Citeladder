import { Fragment, useState } from 'react';

import type { ProbeObjectionsValue } from '@citeladder/contracts/probes';

import { ObjectionActions } from '@/components/perception/objection-actions';
import { ObjectionQuotesRow } from '@/components/perception/objection-quotes';
import { AnswerLink } from '@/components/runs/answer-link';
import { Absence } from '@/components/ui/absence';
import { buttonClasses } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ProbeLede } from '@/components/perception/probe-lede';
import { ExpandToggle, SourcePagesRow } from '@/components/perception/probe-sources';
import type { FigureSegment } from '@/components/ui/figure-strip';
import { ProjectLink } from '@/components/ui/project-link';
import { SectionStack, TitledSection } from '@/components/ui/section';
import { Sparkline } from '@/components/ui/sparkline';
import { TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import { agentHandoffHref } from '@/lib/agent/handoff';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { pluralCount } from '@/lib/format';
import { objectionsSummary } from '@/lib/perception/probe';
import { useWorkspaceCapability } from '@/lib/project/project-scope';

type Group = ProbeObjectionsValue['groups'][number];

const OBJECTION_SKILL = 'objection_sources';

export function PerceptionObjections({
  scope,
  data,
}: Readonly<{ scope: ProjectScope; data: ProbeObjectionsValue }>) {
  return (
    <SectionStack>
      <Lede data={data} />
      <ObjectionTable scope={scope} data={data} />
    </SectionStack>
  );
}

function Lede({ data }: Readonly<{ data: ProbeObjectionsValue }>) {
  const { raised, widest, headline } = objectionsSummary(data);
  const segments: FigureSegment[] = [
    {
      key: 'found',
      label: 'Objections found',
      value: String(raised.length),
      sub: `Grouped from ${pluralCount(data.answers, 'answer')}`,
    },
    {
      key: 'widest',
      label: 'Raised by most engines',
      value: widest ? `${widest.engines.length} of ${data.answered_by.length}` : null,
      sub: widest?.name,
    },
    {
      key: 'average',
      label: 'Average position score',
      value: data.average === null ? null : String(data.average),
      sub: '100 means always raised first',
    },
  ];
  return (
    <ProbeLede
      createdAt={data.probe.created_at}
      headline={headline}
      label="Objections"
      segments={segments}
    />
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'objection', label: 'Objection' },
  {
    key: 'score',
    label: 'Position score',
    kind: 'number',
    width: 'metric',
    hint: '100 when an answer raises it first, 10 less per place, 0 when not raised. Averaged across answers.',
  },
  { key: 'engines', label: 'Engines', kind: 'number', width: 'shortMetric' },
  { key: 'trend', label: 'Trend', sublabel: 'Recent probes', width: 'metric' },
  { key: 'sources', label: 'Sources', kind: 'number', width: 'shortMetric' },
  { key: 'actions', label: 'Actions', kind: 'actions' },
];

function ObjectionTable({
  scope,
  data,
}: Readonly<{ scope: ProjectScope; data: ProbeObjectionsValue }>) {
  const mayEdit = useWorkspaceCapability('write');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <TitledSection title={<QuestionTitle brand={data.brand} question={data.question} />}>
      <DataTable
        label="Objections"
        columns={COLUMNS}
        state={
          data.groups.length
            ? undefined
            : { kind: 'empty', inline: true, message: 'No objections raised.' }
        }
      >
        {data.groups.map((group) => {
          const expanded = open === group.id;
          return (
            <Fragment key={group.id}>
              <TableRow>
                <TableCell>
                  <ExpandToggle
                    open={expanded}
                    onToggle={() => setOpen(expanded ? null : group.id)}
                  >
                    {group.name}
                  </ExpandToggle>
                </TableCell>
                <TableCell numeric>{group.score ?? <Absence label="No answers" />}</TableCell>
                <TableCell numeric>
                  {data.answered_by.length ? (
                    `${group.engines.length} of ${data.answered_by.length}`
                  ) : (
                    <Absence label="No answers" />
                  )}
                </TableCell>
                <TableCell>
                  {group.history.length > 1 ? (
                    <Sparkline
                      values={group.history}
                      label={`${group.name}: position score over the last ${group.history.length} probes, oldest first: ${group.history.map((value) => value ?? 'no answers').join(', ')}`}
                    />
                  ) : (
                    <Absence state="not_run" label="No previous probe" />
                  )}
                </TableCell>
                <TableCell numeric>
                  <Sources sources={group.sources} />
                </TableCell>
                <TableActionsCell>
                  <ProjectLink
                    href={agentHandoffHref({
                      objectionGroupId: group.id,
                      skillId: OBJECTION_SKILL,
                      prompt: `Help me answer the objection "${group.name}".`,
                    })}
                    aria-label={`Ask agent about ${group.name}`}
                    className={buttonClasses('quiet')}
                  >
                    Ask agent
                  </ProjectLink>
                  {mayEdit ? (
                    <ObjectionActions
                      scope={scope}
                      group={group}
                      others={data.groups.filter((other) => other.id !== group.id)}
                    />
                  ) : null}
                </TableActionsCell>
              </TableRow>
              {expanded ? (
                <ObjectionQuotesRow
                  label={`What AI said about ${group.name}`}
                  quotes={group.quotes}
                  columns={COLUMNS}
                />
              ) : null}
              {expanded ? (
                <SourcePagesRow
                  label={`Sources behind ${group.name}`}
                  pages={group.pages}
                  columns={COLUMNS}
                  standing={false}
                />
              ) : null}
            </Fragment>
          );
        })}
      </DataTable>
    </TitledSection>
  );
}

function QuestionTitle({
  brand,
  question,
}: Readonly<{ brand: string; question: ProbeObjectionsValue['question'] }>) {
  const title = `Why buyers might not choose ${brand}`;
  if (!question) return title;
  return (
    <AnswerLink
      answer={{ ...question, prompt: question.text }}
      filters="engine_repetition"
      text="inherit"
    >
      {title}
    </AnswerLink>
  );
}

function Sources({ sources }: Readonly<{ sources: Group['sources'] }>) {
  if (sources === null) return <Absence state="not_applicable" label="Not raised" />;
  return sources || <Absence state="none" label="No sources" />;
}
