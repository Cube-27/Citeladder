import { useState, useSyncExternalStore } from 'react';
import { visibilitySchema } from '@citeladder/contracts/visibility';
import { visibilityTrendListSchema } from '@citeladder/contracts/visibility-trends';
import type { AnalyticsSelection } from '@citeladder/contracts/mcp-app';
import { logicalEngineSchema } from '@citeladder/contracts/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { AreaChart } from '@/components/ui/area-chart';
import { Text } from '@/components/ui/typography';
import { SectionHeader, SectionTitle } from '@/components/ui/section';
import { VISIBILITY_METRICS } from '@/lib/config/visibility';
import { Absence, printed } from '@/components/ui/absence';
import { absent } from '@/lib/format';
import { sentimentFigureValue } from '@/lib/visibility/perception';
import {
  toChartPoints,
  toNamedChartPoints,
  toTrendEvents,
  trendAxis,
  type TrendMetric,
} from '@/lib/visibility/trends';
import { appPolicy } from './config';
import type { AppState, Controller } from './controller';
import { notYetMeasuredMessage, SourcesView, SiteHealthView } from './evidence-views';
import { day, moment, rate } from './format';
import { Stack, Inline } from '@/components/ui/layout';

const views = [
  { value: 'overview', label: 'Overview' },
  { value: 'trends', label: 'Insights' },
  { value: 'sources', label: 'Sources' },
  { value: 'site_health', label: 'Site Health' },
] as const;

function Overview({
  data,
  selection,
  selectCompetitor,
}: Readonly<{
  data: unknown;
  selection: AnalyticsSelection;
  selectCompetitor: Controller['selectCompetitor'];
}>) {
  const parsed = visibilitySchema.safeParse(data);
  if (!parsed.success) {
    const missing = notYetMeasuredMessage(data);
    return (
      <Text as="p" variant="body" tone="ink-2" role={missing ? undefined : 'alert'}>
        {missing ?? 'Visibility evidence is unavailable. Retry or reconnect.'}
      </Text>
    );
  }
  const projection = parsed.data;
  return (
    <Stack gap="loose">
      <div>
        <Select
          ariaLabel="Overview competitor"
          value={selection.competitor ?? ''}
          options={[
            { value: '', label: 'All brands' },
            ...projection.rankings
              .filter((row) => !row.is_brand)
              .map((row) => ({ value: row.name, label: row.name })),
          ]}
          onValueChange={(competitor) => selectCompetitor(competitor || null)}
        />
      </div>
      <Inline gap="wide" wrap align="stretch">
        <div>
          <Text variant="body" tone="ink-2">
            Brand mention rate
          </Text>
          <div>
            <Text variant="figure">{printed(rate(projection.visibility_rate))}</Text>
          </div>
        </div>
        <div>
          <Text variant="body" tone="ink-2">
            Owned citation rate
          </Text>
          <div>
            <Text variant="figure">{printed(rate(projection.owned_citation_rate))}</Text>
          </div>
        </div>
      </Inline>
      <Text as="p" variant="caption">
        Observed {moment(projection.created_at)} ·{' '}
        {projection.counts?.state ?? projection.audit_status} · {projection.total_completed}{' '}
        responses · comparison: {projection.comparison?.status ?? 'unavailable'}
      </Text>
      <Text as="p" variant="caption">
        Analyzer {projection.analyzer_version} · scoring {projection.scoring_rule_version} ·{' '}
        {projection.counts?.expected ?? 'Unknown'} expected / {projection.total_failed ?? 'Unknown'}{' '}
        failed
      </Text>
      <Text as="p" variant="caption">
        {projection.model_provenance.length
          ? projection.model_provenance
              .map(
                (route) =>
                  `${route.logical_engine}: ${route.transport_model}, retrieval ${route.retrieval_enabled}`,
              )
              .join(' · ')
          : 'Model and retrieval provenance unavailable'}
      </Text>
      <SectionHeader>
        <SectionTitle>Brand and competitors</SectionTitle>
      </SectionHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Mentions</TableHead>
            <TableHead>Citations</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projection.rankings.map((row) => (
            <TableRow key={row.name} highlight={row.name === selection.competitor}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{rate(row.mention_rate)}</TableCell>
              <TableCell>{rate(row.citation_rate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Text as="p" variant="caption">
        Rates describe observed answers, not causal impact. Model/retrieval conditions and coverage
        determine comparison eligibility.
      </Text>
    </Stack>
  );
}

function Trends({
  data,
  selection,
  select,
  selectCompetitor,
}: Readonly<{
  data: Record<string, unknown>;
  selection: AnalyticsSelection;
  select: Controller['select'];
  selectCompetitor: Controller['selectCompetitor'];
}>) {
  const [metric, setMetric] = useState<TrendMetric>('brand_mention_rate');
  const parsed = visibilityTrendListSchema.safeParse(data.points);
  if (!parsed.success)
    return (
      <Text as="p" variant="body" tone="ink-2" role="alert">
        Visibility history is unavailable. Retry or reconnect.
      </Text>
    );
  const points = parsed.data;
  const competitors = [
    ...new Set(
      points.flatMap((point) =>
        point.rankings.filter((row) => !row.is_brand).map((row) => row.name),
      ),
    ),
  ];
  const competitor = selection.competitor ?? null;
  const metricLabel = VISIBILITY_METRICS.find((item) => item.value === metric)?.label ?? metric;
  const chart = competitor
    ? toNamedChartPoints(points, metric, competitor)
    : toChartPoints(points, metric);
  const axis = trendAxis(metric, [chart.map((point) => point.value)]);
  const cell = (index: number) => {
    const measured = chart[index]?.value ?? null;
    if (measured !== null) return axis.format(measured);
    const row = points[index]?.rankings.find((entry) =>
      competitor ? entry.name === competitor : entry.is_brand,
    );
    if (metric === 'sentiment')
      return <Absence label={sentimentFigureValue(row?.sentiment).missingLabel} />;
    return absent(
      metric === 'win_rate' && row?.win_answers === 0 ? 'not_applicable' : 'unavailable',
    );
  };
  const events = toTrendEvents(points, { timeZone: 'UTC', engineLabel: (key) => key });
  return (
    <Stack gap="loose">
      <Inline gap="group" wrap align="stretch">
        <Select
          ariaLabel="Trend metric"
          value={metric}
          options={VISIBILITY_METRICS}
          onValueChange={(next) => {
            const picked = VISIBILITY_METRICS.find((item) => item.value === next);
            if (picked) setMetric(picked.value);
          }}
        />
        <Select
          ariaLabel="Competitor"
          value={selection.competitor ?? ''}
          options={[
            { value: '', label: 'Your brand' },
            ...competitors.map((name) => ({ value: name, label: name })),
          ]}
          onValueChange={(competitor) => selectCompetitor(competitor || null)}
        />
      </Inline>
      <AreaChart
        label={`${metricLabel} over time`}
        name={competitor ?? 'Your brand'}
        you={!competitor}
        data={chart.map((point) => ({
          ...point,
          value: axis.plot(point.value),
          label: `${point.dateLabel} · ${axis.format(point.value)}`,
          axisLabel: point.label,
        }))}
        events={events}
        eventsLabel="What changed"
        eventLegend
        yMin={axis.yMin}
        yMax={axis.yMax}
        yFormat={axis.tick}
        format={(plotted) => axis.format(axis.unplot(plotted))}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Completed</TableHead>
            <TableHead>{metricLabel}</TableHead>
            <TableHead>Coverage / model</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((point, index) => (
            <TableRow key={point.source_snapshot_ids.join(',')}>
              <TableCell>{moment(point.completed_at)}</TableCell>
              <TableCell>{cell(index)}</TableCell>
              <TableCell>
                {point.counts?.state ?? 'unknown'} · {point.transport_model ?? 'mixed / unknown'} ·
                retrieval {String(point.retrieval_enabled)}
              </TableCell>
              <TableCell>
                <Button
                  variant="quiet"
                  disabled={!point.audit_id}
                  onClick={() =>
                    void select({
                      ...selection,
                      view: 'sources',
                      audit_id: point.audit_id,
                      from_at: null,
                      to_at: null,
                      transport_model: null,
                      retrieval_enabled: null,
                      competitor: null,
                    })
                  }
                >
                  Sources for this audit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!points.length && (
        <Text as="p" variant="body" tone="ink-2">
          No measured runs in this window.
        </Text>
      )}
      <Text as="p" variant="caption">
        Gaps and changed comparison identities break the line. Sources drill-down selects one
        concrete audit from this window.
      </Text>
    </Stack>
  );
}

function evidenceLabel(
  selection: AnalyticsSelection,
  evidence: Record<string, unknown> | undefined,
) {
  switch (selection.view) {
    case 'site_health':
      return evidence?.observed_at
        ? `Site Health snapshot of ${day(evidence.observed_at)}`
        : 'Latest Site Health snapshot';
    case 'trends':
      return selection.from_at && selection.to_at
        ? `${day(selection.from_at)} to ${day(selection.to_at)}`
        : `Last ${appPolicy.historyDays} days`;
    case 'overview':
    case 'sources':
      if (evidence?.created_at) return `Audit of ${day(evidence.created_at)}`;
      return selection.audit_id ? 'Selected audit' : 'Latest audit';
  }
}

function viewContent(view: AnalyticsSelection['view'], state: AppState, controller: Controller) {
  if (!state.result || !state.selection) return null;
  const selection = state.selection;
  switch (view) {
    case 'overview':
      return (
        <Overview
          data={state.result.evidence}
          selection={selection}
          selectCompetitor={controller.selectCompetitor}
        />
      );
    case 'trends':
      return (
        <Trends
          data={state.result.evidence}
          selection={selection}
          select={controller.select}
          selectCompetitor={controller.selectCompetitor}
        />
      );
    case 'sources':
      return <SourcesView state={state} selection={selection} controller={controller} />;
    case 'site_health':
      return (
        <SiteHealthView
          key={`${selection.project_id}:${selection.snapshot_id}`}
          state={state}
          controller={controller}
        />
      );
  }
}

export function Analytics({ controller }: Readonly<{ controller: Controller }>) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const selection = state.selection;
  const project = state.projects.find((item) => item.id === selection?.project_id);
  const changeView = (view: AnalyticsSelection['view']) => {
    if (!selection) return;
    const to = new Date().toISOString();
    const from = new Date(Date.now() - appPolicy.historyDays * 86400000).toISOString();
    void controller.select({
      ...selection,
      view,
      cursor: null,
      domain: null,
      level: 'domain',
      competitor: null,
      snapshot_id: view === 'site_health' ? selection.snapshot_id : null,
      audit_id: view === 'trends' || view === 'site_health' ? null : selection.audit_id,
      from_at: view === 'trends' ? from : null,
      to_at: view === 'trends' ? to : null,
      transport_model: null,
      retrieval_enabled: null,
      engine: view === 'site_health' ? null : selection.engine,
      cohort: view === 'site_health' ? 'core' : selection.cohort,
    });
  };
  return (
    <Stack as="main" gap="loose" inset>
      <Text as="h1" variant="title">
        CiteLadder analytics
      </Text>
      <Inline gap="group" wrap align="stretch">
        <Select
          ariaLabel="Project and workspace"
          value={selection?.project_id ?? ''}
          options={[
            { value: '', label: 'Select a project' },
            ...state.projects.map((project) => ({
              value: project.id,
              label: `${project.workspace_name} / ${project.name}`,
            })),
          ]}
          onValueChange={(project_id) => {
            if (project_id) void controller.select({ project_id, view: 'overview' });
          }}
        />
        <Button variant="secondary" onClick={() => void controller.loadProjects()}>
          Refresh connection
        </Button>
        {state.projectCursor && (
          <Button variant="quiet" onClick={() => void controller.loadProjects(state.projectCursor)}>
            More projects
          </Button>
        )}
      </Inline>
      {state.error && (
        <Text as="div" variant="body" tone="ink-2" role="alert">
          {state.error}
          <Button
            variant="quiet"
            onClick={() =>
              selection ? void controller.select(selection) : void controller.loadProjects()
            }
          >
            Retry
          </Button>
        </Text>
      )}
      {state.busy && (
        <Text as="output" variant="body" tone="ink-2">
          Loading persisted evidence…
        </Text>
      )}
      {!selection && (
        <Text as="p" variant="body" tone="ink-2">
          Connect your account and select a project. If you have no projects, complete onboarding in
          CiteLadder.
        </Text>
      )}
      {selection && (
        <>
          <Text as="p" variant="caption">
            {project ? `${project.name} · ` : ''}
            {evidenceLabel(selection, state.result?.evidence)}
          </Text>
          {selection.view !== 'site_health' && (
            <Inline gap="group" wrap align="stretch">
              <Select
                ariaLabel="Engine"
                value={selection.engine ?? ''}
                options={[
                  { value: '', label: 'All engines' },
                  ...logicalEngineSchema.options.map((engine) => ({
                    value: engine,
                    label: engine,
                  })),
                ]}
                onValueChange={(engine) =>
                  void controller.select({ ...selection, engine: engine || null, cursor: null })
                }
              />
              <Select
                ariaLabel="Cohort"
                value={selection.cohort}
                options={[
                  { value: 'core', label: 'Core' },
                  { value: 'comparison', label: 'Comparison' },
                ]}
                onValueChange={(cohort) =>
                  void controller.select({ ...selection, cohort, cursor: null })
                }
              />
            </Inline>
          )}
          {selection.view === 'trends' && (
            <Inline gap="group" wrap align="stretch">
              <Input
                type="date"
                aria-label="Period start"
                value={selection.from_at?.slice(0, 10) ?? ''}
                onChange={(event) => {
                  if (event.target.value)
                    void controller.select({
                      ...selection,
                      from_at: `${event.target.value}T00:00:00Z`,
                    });
                }}
              />
              <Input
                type="date"
                aria-label="Period end"
                value={selection.to_at?.slice(0, 10) ?? ''}
                onChange={(event) => {
                  if (event.target.value)
                    void controller.select({
                      ...selection,
                      to_at: `${event.target.value}T23:59:59.999999Z`,
                    });
                }}
              />
            </Inline>
          )}
          <Tabs
            ariaLabel="Analytics view"
            items={views.map((view) => ({
              ...view,
              disabled: view.value === 'sources' && selection.view === 'trends',
            }))}
            value={selection.view}
            onValueChange={changeView}
          >
            {views.map((view) => (
              <TabPanel key={view.value} value={view.value}>
                {viewContent(view.value, state, controller)}
              </TabPanel>
            ))}
          </Tabs>
        </>
      )}
      <div>
        {state.result && (
          <Button asChild variant="secondary">
            <a href={state.result.links.application} target="_blank" rel="noreferrer">
              Open CiteLadder
            </a>
          </Button>
        )}
        <Button asChild variant="quiet">
          <a
            href={state.result?.links.onboarding ?? 'https://app.citeladder.com/onboarding'}
            target="_blank"
            rel="noreferrer"
          >
            Set up a project
          </a>
        </Button>
      </div>
    </Stack>
  );
}
