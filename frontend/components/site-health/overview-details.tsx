import { useState } from 'react';
import { ProjectLink } from '@/components/ui/project-link';

import {
  AeoScoreCard,
  SeverityCard,
  WebFundamentalsScoreCard,
  measurementLabel,
} from './score-cards';
import { CohortCompositionContext } from './cohort-composition-context';
import { AppGrid } from '@/components/ui/app-grid';
import { StatusMark } from '@/components/ui/status-mark';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Delta } from '@/components/ui/delta';
import { Drawer } from '@/components/ui/drawer';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow } from '@/components/ui/table';
import { AreaChart } from '@/components/ui/area-chart';
import { TextLink } from '@/components/ui/text-link';
import { Absence } from '@/components/ui/absence';
import type { SiteHealthOverview } from '@citeladder/contracts';
import { issueTitle } from '@/lib/site-health/issues';
import { checksRunLabel, type ChecksRun } from '@/lib/site-health/status';
import { textRole } from '@/components/ui/typography';
import { Inline, Stack } from '@/components/ui/layout';
import {
  EditorialSectionHeader,
  ledgerClasses,
  ledgerItemClasses,
} from '@/components/ui/workspace';
import { ICONS } from '@/lib/icons';
import { StateBlock } from '@/components/ui/state-block';
import { SectionCard, SectionContent, TitledSection } from '@/components/ui/section';
import { formatCount, formatPercent, pluralCount } from '@/lib/format';

export function OverviewDetails({ data }: Readonly<{ data: SiteHealthOverview }>) {
  const [webFundamentalsOpen, setWebFundamentalsOpen] = useState(false);
  return (
    <>
      <AppGrid layout="thirds">
        <WebFundamentalsScoreCard
          data={data}
          actions={
            <ActionButton action="viewEvidence" onClick={() => setWebFundamentalsOpen(true)} />
          }
        />
        <AeoScoreCard
          score={data.aeo_readiness_score}
          state={data.aeo_measurement_state}
          dimensions={data.aeo_dimensions}
          actions={
            <Button asChild variant="secondary">
              <ProjectLink href="/site?tab=aeo-readiness">Open report</ProjectLink>
            </Button>
          }
        />
        <SeverityCard data={data} />
      </AppGrid>
      <TopIssues issues={data.top_issues} />
      <AppGrid layout="halves">
        <OpenIssuesTrendCard points={data.open_issue_trend} />
        <ChangeSummaryCard data={data.change_summary} />
      </AppGrid>
      <WebFundamentalsDrawer
        data={data.web_fundamentals}
        open={webFundamentalsOpen}
        onOpenChange={setWebFundamentalsOpen}
      />
    </>
  );
}

const TOP_ISSUE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'impact', label: 'Impact', kind: 'status', width: 'figure' },
  { key: 'issue', label: 'Issue', kind: 'identity' },
  { key: 'pages', label: 'Pages affected', kind: 'number' },
];

function TopIssues({ issues }: Readonly<{ issues: SiteHealthOverview['top_issues'] }>) {
  return (
    <DataTable
      title="Top issues"
      toolbar={{
        actions: (
          <Button asChild variant="secondary">
            <ProjectLink href="/issues">View all issues</ProjectLink>
          </Button>
        ),
      }}
      columns={TOP_ISSUE_COLUMNS}
      state={
        issues.length === 0
          ? { kind: 'empty', icon: ICONS.issues, headingLevel: 3, heading: 'No issues found' }
          : undefined
      }
    >
      {issues.map((issue) => (
        <TableRow key={issue.rule_id}>
          <TableCell className="whitespace-nowrap">
            <StatusMark variant="severity" value={impactSeverity(issue.impact_band)}>
              {impactLabel(issue.impact_band)}
            </StatusMark>
          </TableCell>
          <TableCell>
            <TextLink
              text="body"
              underline="hover"
              href={issueHref(issue)}
              className="inline-flex min-h-6 min-w-0 items-center"
            >
              <ClampText lines={1}>{issueTitle(issue)}</ClampText>
            </TextLink>
          </TableCell>
          <TableCell numeric>{formatCount(issue.affected_pages)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

function OpenIssuesTrendCard({
  points,
}: Readonly<{ points: SiteHealthOverview['open_issue_trend'] }>) {
  return (
    <TitledSection title="Open issues over time">
      <SectionContent>
        <Stack gap="item">
          <AreaChart
            data={points.map((point) => ({
              label: point.day,
              value: point.open_count,
              timestamp: Date.parse(point.day),
            }))}
            label="Open issues over time"
            name="Open issues"
            you={false}
            height="sm"
            yMin={0}
            yFormat={(value) => `${Math.round(value)}`}
          />
          {points.length < 2 ? (
            <p className="type-caption">The trend starts once audits land on two days.</p>
          ) : null}
        </Stack>
      </SectionContent>
    </TitledSection>
  );
}

const CHANGE_METRIC_LABELS: Record<string, string> = {
  web_fundamentals_score: 'Web fundamentals',
  web_fundamentals_coverage: 'Web fundamentals coverage',
  aeo_readiness_score: 'AEO readiness',
  aeo_measurement_coverage: 'AEO checklist completion',
};

function ChangeSummaryCard({ data }: Readonly<{ data: SiteHealthOverview['change_summary'] }>) {
  return (
    <TitledSection title="Score change">
      <SectionCard>
        <Stack>
          {data.metrics.map((metric) => (
            <Inline gap="compact" key={metric.key} className="type-body text-ink-2 justify-between">
              <span className="text-ink-2">{CHANGE_METRIC_LABELS[metric.key] ?? metric.label}</span>
              <ChangeDelta metricKey={metric.key} delta={metric.delta} />
            </Inline>
          ))}
          {data.state === 'unavailable' ? (
            <StateBlock kind="empty" inline message="No comparable crawl yet." />
          ) : null}
          <CohortCompositionContext reason={data.reason} composition={data.cohort_composition} />
        </Stack>
      </SectionCard>
    </TitledSection>
  );
}

function ChangeDelta({ metricKey, delta }: Readonly<{ metricKey: string; delta: number | null }>) {
  const coverage = metricKey.endsWith('_coverage');
  const scale = coverage ? 100 : 1;
  return (
    <Delta
      value={delta === null ? null : delta * scale}
      precision={0}
      unit={coverage ? ' pp' : ''}
    />
  );
}

function impactLabel(impactBand: number): 'High' | 'Medium' | 'Low' {
  if (impactBand >= 3) return 'High';
  if (impactBand === 2) return 'Medium';
  return 'Low';
}

function impactSeverity(impactBand: number): 'high' | 'medium' | 'low' {
  if (impactBand >= 3) return 'high';
  if (impactBand === 2) return 'medium';
  return 'low';
}

function measurementTone(state: string): 'success' | 'warning' | 'info' {
  if (state === 'measured') return 'success';
  if (state === 'limited_evidence') return 'warning';
  return 'info';
}

type Area = SiteHealthOverview['web_fundamentals']['areas'][number];

const areaChecks = (area: Area): ChecksRun => ({
  run: area.passed_count + area.missing_count,
  total: area.passed_count + area.missing_count + area.unknown_count + area.unavailable_count,
});

function MeasurementMark({ state, checks }: Readonly<{ state: string; checks: ChecksRun }>) {
  if (state === 'not_measured' || state === 'not_applicable')
    return <Absence state={state} label={measurementLabel(state)} />;
  return (
    <StatusMark variant="status" value={measurementTone(state)}>
      {(state === 'limited_evidence' ? checksRunLabel(checks) : null) ?? measurementLabel(state)}
    </StatusMark>
  );
}

function issueHref(issue: SiteHealthOverview['top_issues'][number]): string {
  const params = new URLSearchParams({ rule: issue.rule_id });
  if (issue.section && issue.section !== 'technical') params.set('section', issue.section);
  return `/issues?${params.toString()}`;
}

function WebFundamentalsDrawer({
  data,
  open,
  onOpenChange,
}: Readonly<{
  data: SiteHealthOverview['web_fundamentals'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Web fundamentals">
      <div className={ledgerClasses()}>
        {data.areas.map((area) => (
          <Stack as="section" key={area.key} className={ledgerItemClasses()}>
            <EditorialSectionHeader
              title={<span className="capitalize">{area.key}</span>}
              description={
                <>
                  {area.coverage === null ? (
                    <Absence state="not_measured" />
                  ) : (
                    formatPercent(area.coverage)
                  )}{' '}
                  evidence coverage · {formatCount(area.passed_count)} passed ·{' '}
                  {formatCount(area.missing_count)} missing
                </>
              }
              actions={<MeasurementMark state={area.state} checks={areaChecks(area)} />}
            />
            <Stack>
              {area.top_findings.length === 0 ? (
                <StateBlock kind="empty" inline message="No missing checks in this area." />
              ) : (
                area.top_findings.map((finding) => (
                  <Stack gap="tight" key={finding.rule_id}>
                    <span className={textRole('body')}>{finding.title}</span>
                    <span className="type-caption">
                      {pluralCount(finding.affected_pages, 'page')} affected · {finding.remediation}
                    </span>
                  </Stack>
                ))
              )}
            </Stack>
          </Stack>
        ))}
      </div>
    </Drawer>
  );
}
