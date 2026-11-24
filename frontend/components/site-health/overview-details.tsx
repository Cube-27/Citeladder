import { useState } from 'react';
import { ProjectLink } from '@/components/ui/project-link';

import {
  AeoScoreCard,
  SeverityCard,
  WebFundamentalsScoreCard,
  measurementLabel,
} from './score-cards';
import { AppGrid } from '@/components/ui/app-grid';
import { StatusMark } from '@/components/ui/status-mark';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Absence } from '@/components/ui/absence';
import type { SiteHealthOverview, SiteScoreSummary } from '@citeladder/contracts';
import { KnownUrlsCard, PageKindsCard, TopIssues } from './overview-cards';
import { checksRunLabel, type ChecksRun } from '@/lib/site-health/status';
import { textRole } from '@/components/ui/typography';
import { Stack } from '@/components/ui/layout';
import {
  EditorialSectionHeader,
  ledgerClasses,
  ledgerItemClasses,
} from '@/components/ui/workspace';
import { StateBlock } from '@/components/ui/state-block';
import { formatCount, formatPercent, pluralCount } from '@/lib/format';

export function OverviewDetails({
  data,
  workspaceId,
  crawlId,
  summary,
}: Readonly<{
  data: SiteHealthOverview;
  workspaceId: string;
  crawlId: string;
  summary: SiteScoreSummary | null;
}>) {
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
              <ProjectLink href="/aeo-readiness">Open report</ProjectLink>
            </Button>
          }
        />
        <SeverityCard data={data} />
      </AppGrid>
      <TopIssues workspaceId={workspaceId} crawlId={crawlId} />
      <AppGrid layout="halves">
        <PageKindsCard summary={summary} />
        <KnownUrlsCard summary={summary} />
      </AppGrid>
      <WebFundamentalsDrawer
        data={data.web_fundamentals}
        open={webFundamentalsOpen}
        onOpenChange={setWebFundamentalsOpen}
      />
    </>
  );
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
