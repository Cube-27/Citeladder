import { useState } from 'react';
import { ProjectLink } from '@/components/ui/project-link';

import { CohortCompositionContext } from './cohort-composition-context';
import { AppGrid } from '@/components/ui/app-grid';
import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Delta } from '@/components/ui/delta';
import { Drawer } from '@/components/ui/drawer';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ClampText, TableCell, TableRow } from '@/components/ui/table';
import { StepChart } from '@/components/ui/step-chart';
import { TextLink } from '@/components/ui/text-link';
import { Absence } from '@/components/ui/absence';
import type { SiteHealthOverview } from '@citeladder/contracts';
import { issueTitle } from '@/lib/site-health/issues';
import { formatScore, PLACEHOLDER, statusLabel } from '@/lib/site-health/status';
import { textRole } from '@/components/ui/typography';
import { Inline, Stack } from '@/components/ui/layout';
import {
  EditorialSectionHeader,
  ledgerClasses,
  ledgerItemClasses,
} from '@/components/ui/workspace';
import { ICONS } from '@/lib/icons';
import { StateBlock } from '@/components/ui/state-block';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';

function percent(value: number | null): string {
  return value === null ? PLACEHOLDER : `${Math.round(value * 100)}%`;
}

export function OverviewDetails({ data }: Readonly<{ data: SiteHealthOverview }>) {
  const [webFundamentalsOpen, setWebFundamentalsOpen] = useState(false);
  return (
    <>
      <AppGrid layout="halves">
        <DimensionLedger dimensions={data.aeo_dimensions} />
        <TopIssues issues={data.top_issues} />
      </AppGrid>
      <AppGrid layout="thirds">
        <WebFundamentalsCard
          data={data.web_fundamentals}
          onOpen={() => setWebFundamentalsOpen(true)}
        />
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

function DimensionLedger({
  dimensions,
}: Readonly<{ dimensions: SiteHealthOverview['aeo_dimensions'] }>) {
  return (
    <DataTable
      title="AEO Readiness by pillar"
      toolbar={{
        actions: (
          <Button asChild variant="secondary">
            <ProjectLink href="/site?tab=aeo-readiness">Open AEO Readiness</ProjectLink>
          </Button>
        ),
      }}
      columns={PILLAR_COLUMNS}
      minWidth="sm"
    >
      {dimensions.map((dimension) => (
        <TableRow key={dimension.key}>
          <TableCell>
            {/* Name over one caption line: the ledger is a scanning
                surface, and a wrapping sentence pushes the score columns
                off a screenful. Full text stays available on hover. */}
            <div className="grid min-w-0">
              <ClampText lines={1} className={textRole('emphasis', 'text-ink')}>
                {dimension.label}
              </ClampText>
              <ClampText lines={1} className="type-caption">
                {dimension.reason === 'measured_at_site_scope'
                  ? `Measured at site scope · ${dimension.description}`
                  : dimension.description}
              </ClampText>
            </div>
          </TableCell>
          {/* The number only; a pillar with no score says why. */}
          <TableCell numeric>
            {dimension.score === null ? (
              <ClampText lines={1} className="type-caption">
                {dimension.reason === 'measured_at_site_scope'
                  ? 'Site-scoped evidence'
                  : statusLabel(dimension.dimension_measurement_state)}
              </ClampText>
            ) : (
              formatScore(dimension.score)
            )}
          </TableCell>
          <TableCell numeric>
            {dimension.coverage === null ? (
              <Absence state="not_measured" />
            ) : (
              percent(dimension.coverage)
            )}
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const PILLAR_COLUMNS: readonly DataTableColumn[] = [
  { key: 'pillar', label: 'Pillar' },
  { key: 'score', label: 'Score', width: 'figure', numeric: true },
  { key: 'coverage', label: 'Coverage', width: 'figure', numeric: true },
];

// Issues and advisories share the table, so a class column would print the
// same word on most rows; an advisory carries its own badge beside its title
// instead, as it does on a page's issue list.
const TOP_ISSUE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'impact', label: 'Impact', width: 'figure' },
  { key: 'issue', label: 'Issue' },
  { key: 'pages', label: 'Pages', width: 'figure', numeric: true },
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
        <TableRow key={`${issue.rule_id}-${issue.finding_class}`}>
          <TableCell className="whitespace-nowrap">
            <StatusMark variant="status" value={impactTone(issue.impact_band)}>
              {impactLabel(issue.impact_band)}
            </StatusMark>
          </TableCell>
          <TableCell>
            <Inline>
              <TextLink
                text="body"
                href={issueHref(issue)}
                className="inline-flex min-h-6 min-w-0 items-center"
              >
                {/* One line, cut with its full title in a tooltip: beside an
                    Advisory badge in a half-width card, two clamped lines
                    broke a title mid-word ("Recommend / ed schema"). */}
                <ClampText lines={1}>{issueTitle(issue)}</ClampText>
              </TextLink>
              {issue.finding_class === 'advisory' ? <Tag>Advisory</Tag> : null}
            </Inline>
          </TableCell>
          <TableCell numeric>{issue.affected_pages}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

function WebFundamentalsCard({
  data,
  onOpen,
}: Readonly<{ data: SiteHealthOverview['web_fundamentals']; onOpen: () => void }>) {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Web Fundamentals</SectionTitle>
        <SectionDescription>What each page’s HTML and response headers show.</SectionDescription>
      </SectionHeader>
      <SectionContent>
        <Stack gap="workspace">
          {/* One list, one area a row: a 2 × 2 grid of badges left uneven
              cells in a row of equal-height cards. */}
          <ul aria-label="Web Fundamentals areas" className={ledgerClasses()}>
            {data.areas.map((area) => (
              <Inline as="li" key={area.key} className={ledgerItemClasses('justify-between')}>
                <span className={textRole('body', 'text-ink-2 capitalize')}>{area.key}</span>
                <StatusMark variant="status" value={measurementTone(area.state)}>
                  {statusLabel(area.state)}
                </StatusMark>
              </Inline>
            ))}
          </ul>
          <ActionButton action="viewEvidence" onClick={onOpen} className="justify-self-start" />
        </Stack>
      </SectionContent>
    </Section>
  );
}

/** Open issues on the tracked pages, one point per day an audit landed (SH-B9). */
function OpenIssuesTrendCard({
  points,
}: Readonly<{ points: SiteHealthOverview['open_issue_trend'] }>) {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Open issues over time</SectionTitle>
        <SectionDescription>
          Each day&rsquo;s count after that day&rsquo;s crawls and re-audits of your tracked pages.
        </SectionDescription>
      </SectionHeader>
      <SectionContent>
        <Stack gap="item">
          <StepChart
            data={points.map((point) => ({
              label: point.day,
              value: point.open_count,
              timestamp: Date.parse(point.day),
            }))}
            label="Open issues over time"
            name="Open issues"
            // Your own site's count, read alone: no brand is compared, so no line is the accent.
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
    </Section>
  );
}

/**
 * Change-summary labels are frozen into the snapshot at build time, so a
 * Presentation resolves change-summary labels from the stable metric key.
 */
const CHANGE_METRIC_LABELS: Record<string, string> = {
  web_fundamentals_score: 'Web Fundamentals',
  web_fundamentals_coverage: 'Web Fundamentals coverage',
  aeo_readiness_score: 'AEO Readiness',
  aeo_measurement_coverage: 'AEO checklist completion',
};

function ChangeSummaryCard({ data }: Readonly<{ data: SiteHealthOverview['change_summary'] }>) {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Change summary</SectionTitle>
        <SectionDescription>Change since the previous comparable crawl.</SectionDescription>
      </SectionHeader>
      <SectionContent>
        <Stack>
          {data.metrics.map((metric) => (
            <Inline gap="compact" key={metric.key} className="type-body text-ink-2 justify-between">
              <span className="text-ink-2">{CHANGE_METRIC_LABELS[metric.key] ?? metric.label}</span>
              <ChangeDelta metricKey={metric.key} delta={metric.delta} />
            </Inline>
          ))}
          {data.state === 'unavailable' ? (
            <StateBlock kind="empty" inline message="No comparable snapshot yet." />
          ) : null}
          <CohortCompositionContext reason={data.reason} composition={data.cohort_composition} />
        </Stack>
      </SectionContent>
    </Section>
  );
}

/**
 * Every change-summary metric is a score or a coverage share, so a rise is an
 * improvement. Coverage is a 0–1 share; its change reads in percentage points.
 */
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

function impactTone(impactBand: number): 'danger' | 'warning' | 'info' {
  if (impactBand >= 3) return 'danger';
  if (impactBand === 2) return 'warning';
  return 'info';
}

function measurementTone(state: string): 'success' | 'warning' | 'info' {
  if (state === 'measured') return 'success';
  if (state === 'limited_evidence') return 'warning';
  return 'info';
}

function issueHref(issue: SiteHealthOverview['top_issues'][number]): string {
  const params = new URLSearchParams({ rule: issue.rule_id });
  // The tab the rule is listed under, so the filtered list is the one on screen.
  if (issue.section && issue.section !== 'technical') params.set('section', issue.section);
  if (issue.finding_class === 'advisory') params.set('finding_class', issue.finding_class);
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
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Web Fundamentals"
      description="What each page’s HTML and response headers show, area by area."
    >
      <div className={ledgerClasses()}>
        {data.areas.map((area) => (
          <Stack as="section" key={area.key} className={ledgerItemClasses()}>
            <EditorialSectionHeader
              title={<span className="capitalize">{area.key}</span>}
              description={
                <>
                  {percent(area.coverage)} evidence coverage · {area.passed_count} passed ·{' '}
                  {area.missing_count} missing
                </>
              }
              actions={
                <StatusMark variant="status" value={measurementTone(area.state)}>
                  {statusLabel(area.state)}
                </StatusMark>
              }
            />
            <Stack>
              {area.top_findings.length === 0 ? (
                <StateBlock kind="empty" inline message="No missing checks in this area." />
              ) : (
                area.top_findings.map((finding) => (
                  <Stack gap="tight" key={finding.rule_id}>
                    <span className={textRole('body')}>{finding.title}</span>
                    <span className="type-caption">
                      {finding.affected_pages} affected pages · {finding.remediation}
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
