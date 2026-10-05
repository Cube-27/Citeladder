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
import { TrendChart } from '@/components/ui/trend-chart';
import { SectionTitle, Label, Metric, textRole } from '@/components/ui/typography';
import { appPolicy } from './config';
import type { Controller } from './controller';
import { SourcesView, SiteHealthView } from './evidence-views';
import { rate } from './format';

const views = [
  { value: 'overview', label: 'Overview' },
  { value: 'trends', label: 'Trends' },
  { value: 'sources', label: 'Sources' },
  { value: 'site_health', label: 'Site Health' },
] as const;

function Overview({
  data,
  selection,
  select,
}: Readonly<{ data: unknown; selection: AnalyticsSelection; select: Controller['select'] }>) {
  const parsed = visibilitySchema.safeParse(data);
  if (!parsed.success)
    return (
      <p className={textRole('body')}>
        No completed measurement. Run a measurement in CiteLadder, then return.
      </p>
    );
  const projection = parsed.data;
  return (
    <div className="space-y-4">
      <Select
        ariaLabel="Overview competitor"
        value={selection.competitor ?? ''}
        options={[
          { value: '', label: 'All brands' },
          ...projection.rankings
            .filter((row) => !row.is_brand)
            .map((row) => ({ value: row.name, label: row.name })),
        ]}
        onValueChange={(competitor) =>
          void select({ ...selection, competitor: competitor || null })
        }
      />
      <div className="flex flex-wrap gap-6">
        <div>
          <Label>Brand mention rate</Label>
          <div>
            <Metric>{rate(projection.visibility_rate)}</Metric>
          </div>
        </div>
        <div>
          <Label>Owned citation rate</Label>
          <div>
            <Metric>{rate(projection.owned_citation_rate)}</Metric>
          </div>
        </div>
      </div>
      <p className={textRole('caption')}>
        Observed {projection.created_at} · {projection.counts?.state ?? projection.audit_status} ·{' '}
        {projection.total_completed} responses · comparison:{' '}
        {projection.comparison?.status ?? 'unavailable'}
      </p>
      <p className={textRole('caption')}>
        Analyzer {projection.analyzer_version} · scoring {projection.scoring_rule_version} ·{' '}
        {projection.counts?.expected ?? 'Unknown'} expected / {projection.total_failed} failed
      </p>
      <p className={textRole('caption')}>
        {projection.model_provenance.length
          ? projection.model_provenance
              .map(
                (route) =>
                  `${route.logical_engine}: ${route.transport_model}, retrieval ${route.retrieval_enabled ?? 'unknown'}`,
              )
              .join(' · ')
          : 'Model and retrieval provenance unavailable'}
      </p>
      <SectionTitle>Brand and competitors</SectionTitle>
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
      <p className={textRole('caption')}>
        Rates describe observed answers, not causal impact. Model/retrieval conditions and coverage
        determine comparison eligibility.
      </p>
    </div>
  );
}

function Trends({
  data,
  selection,
  select,
}: Readonly<{
  data: Record<string, unknown>;
  selection: AnalyticsSelection;
  select: Controller['select'];
}>) {
  const [metric, setMetric] = useState<string>('brand_mention_rate');
  const parsed = visibilityTrendListSchema.safeParse(data.points);
  const points = parsed.success ? parsed.data : [];
  const competitors = [
    ...new Set(
      points.flatMap((point) =>
        point.rankings.filter((row) => !row.is_brand).map((row) => row.name),
      ),
    ),
  ];
  const value = (point: (typeof points)[number]) =>
    selection.competitor
      ? (point.rankings.find((row) => row.name === selection.competitor)?.[
          metric === 'brand_mention_rate' ? 'mention_rate' : 'citation_rate'
        ] ?? null)
      : metric === 'brand_mention_rate'
        ? point.brand_mention_rate
        : point.owned_citation_rate;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select
          ariaLabel="Trend metric"
          value={metric}
          options={appPolicy.metrics}
          onValueChange={setMetric}
        />
        <Select
          ariaLabel="Competitor"
          value={selection.competitor ?? ''}
          options={[
            { value: '', label: 'Your brand' },
            ...competitors.map((name) => ({ value: name, label: name })),
          ]}
          onValueChange={(competitor) =>
            void select({ ...selection, competitor: competitor || null })
          }
        />
      </div>
      <TrendChart
        label="Observed visibility history"
        domainMax={1}
        formatTick={rate}
        data={points.map((point, index) => ({
          label: point.completed_at,
          value: value(point),
          breakBefore:
            index > 0 &&
            (!point.comparison_key ||
              point.comparison_key !== points[index - 1].comparison_key ||
              JSON.stringify(point.analyzer_versions) !==
                JSON.stringify(points[index - 1].analyzer_versions) ||
              JSON.stringify(point.scoring_rule_versions) !==
                JSON.stringify(points[index - 1].scoring_rule_versions)),
        }))}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Completed</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Coverage / model</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((point) => (
            <TableRow key={point.source_snapshot_ids.join(',')}>
              <TableCell>{point.completed_at}</TableCell>
              <TableCell>{rate(value(point))}</TableCell>
              <TableCell>
                {point.counts?.state ?? 'unknown'} · {point.transport_model ?? 'mixed / unknown'} ·
                retrieval {String(point.retrieval_enabled)}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
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
      {!points.length && <p className={textRole('body')}>No measured runs in this window.</p>}
      <p className={textRole('caption')}>
        Gaps and changed comparison identities break the line. Sources drill-down selects one
        concrete audit from this window.
      </p>
    </div>
  );
}

export function Analytics({ controller }: Readonly<{ controller: Controller }>) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const selection = state.selection;
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
    <main className="space-y-4 p-4">
      <h1 className={textRole('pageTitle')}>CiteLadder analytics</h1>
      <div className="flex flex-wrap gap-3">
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
          <Button variant="ghost" onClick={() => void controller.loadProjects(state.projectCursor)}>
            More projects
          </Button>
        )}
      </div>
      {state.error && (
        <div role="alert" className={textRole('body')}>
          {state.error}
          <Button
            variant="ghost"
            onClick={() =>
              selection ? void controller.select(selection) : void controller.loadProjects()
            }
          >
            Retry
          </Button>
        </div>
      )}
      {state.busy && <output className={textRole('body')}>Loading persisted evidence…</output>}
      {!selection && (
        <p className={textRole('body')}>
          Connect your account and select a project. If you have no projects, complete onboarding in
          CiteLadder.
        </p>
      )}
      {selection && (
        <>
          <p className={textRole('caption')}>
            Project {selection.project_id} ·{' '}
            {selection.audit_id
              ? `Audit ${selection.audit_id}`
              : selection.snapshot_id
                ? `Snapshot ${selection.snapshot_id}`
                : 'No audit selected'}
          </p>
          {selection.view !== 'site_health' && (
            <div className="flex flex-wrap gap-3">
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
            </div>
          )}
          {selection.view === 'trends' && (
            <div className="flex flex-wrap gap-3">
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
            </div>
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
                {state.result &&
                  (view.value === 'overview' ? (
                    <Overview
                      data={state.result.evidence}
                      selection={selection}
                      select={controller.select}
                    />
                  ) : view.value === 'trends' ? (
                    <Trends
                      data={state.result.evidence}
                      selection={selection}
                      select={controller.select}
                    />
                  ) : view.value === 'sources' ? (
                    <SourcesView state={state} controller={controller} />
                  ) : (
                    <SiteHealthView
                      key={`${selection.project_id}:${selection.snapshot_id}`}
                      state={state}
                      controller={controller}
                    />
                  ))}
              </TabPanel>
            ))}
          </Tabs>
        </>
      )}
      {state.result && (
        <Button asChild variant="secondary">
          <a href={state.result.links.application} target="_blank" rel="noreferrer">
            Open CiteLadder
          </a>
        </Button>
      )}
      <Button asChild variant="ghost">
        <a
          href={state.result?.links.onboarding ?? 'https://app.citeladder.com/onboarding'}
          target="_blank"
          rel="noreferrer"
        >
          Set up a project
        </a>
      </Button>
    </main>
  );
}
