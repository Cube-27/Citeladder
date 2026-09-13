import { ProjectLink } from '@/components/layout/scoped-link';
import { cn } from '@/lib/utils';
import { hairlineBandClasses, hairlineBandItemClasses } from '@/components/ui/workspace';

import { Button } from '@/components/ui/button';
import { cardClasses } from '@/components/ui/card-variants';
import { ScoreRing } from '@/components/ui/score-ring';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { ICONS } from '@/lib/icons';
import type { SiteCrawl, SiteHealthDashboard, SiteHealthOverview } from '@/lib/api/types';
import { PLACEHOLDER, measurementCaveat, shouldPollCrawl } from '@/lib/site-health/status';
import { textRole } from '@/components/ui/typography';

type Summary = SiteHealthDashboard['score_summary'];
type MetricContext = {
  overview?: SiteHealthOverview;
  summary: Summary;
  analyzed: number;
  selected: number;
  active: boolean;
};
type MetricModel = {
  title: string;
  value: number | null;
  valueUnit?: 'score' | 'percent';
  /** Only when the measurement is qualified; null on the ordinary case. */
  caveat: string | null;
  detail: string;
  href: string;
  icon: typeof ICONS.site;
};

function percentRatio(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : value * 100;
}

export function OverviewMetricCards({
  overview,
  dashboard,
  crawl,
}: Readonly<{
  overview?: SiteHealthOverview;
  dashboard: SiteHealthDashboard | undefined;
  crawl: SiteCrawl | null;
}>) {
  const context = metricContext(overview, dashboard, crawl);
  const metrics = [
    technicalMetric(context),
    aeoMetric(context),
    measurementMetric(context),
    crawlMetric(context),
  ];
  return (
    <div
      className={cn(
        cardClasses(),
        hairlineBandClasses,
        'overflow-hidden border-y-0 sm:grid-cols-4',
      )}
      data-testid="overview-metrics"
    >
      {metrics.map((metric) => (
        <OverviewMetricCard key={metric.title} {...metric} />
      ))}
    </div>
  );
}

function metricContext(
  overview: SiteHealthOverview | undefined,
  dashboard: SiteHealthDashboard | undefined,
  crawl: SiteCrawl | null,
): MetricContext {
  const summary: Summary = dashboard?.score_summary ?? crawl?.score_summary ?? null;
  return {
    overview,
    summary,
    analyzed: overview?.audited_page_count ?? summary?.analyzed_count ?? crawl?.analyzed_count ?? 0,
    selected:
      overview?.selected_page_count ?? summary?.selected_count ?? crawl?.visible_url_count ?? 0,
    active: crawl !== null && shouldPollCrawl(crawl),
  };
}

function technicalMetric(context: MetricContext): MetricModel {
  const source = context.overview ?? context.summary;
  const score = source?.web_fundamentals_score;
  const coverage = source?.web_fundamentals_coverage;
  const state = source?.web_fundamentals_state;
  return {
    title: 'Web Fundamentals',
    value: score ?? null,
    caveat: measurementCaveat(state, coverage),
    detail: context.overview
      ? occurrenceDetail(
          context.overview.technical_defect_count,
          'defect',
          context.overview.technical_defect_affected_page_count,
        )
      : `${context.analyzed} pages analyzed`,
    href: '/issues?dimension=technical',
    icon: ICONS.siteHealth,
  };
}

function aeoMetric(context: MetricContext): MetricModel {
  const source = context.overview ?? context.summary;
  const score = source?.aeo_readiness_score;
  const coverage = source?.aeo_measurement_coverage;
  const state = source?.aeo_measurement_state;
  return {
    title: 'AEO Readiness',
    value: score ?? null,
    caveat: measurementCaveat(state, coverage),
    detail: context.overview
      ? occurrenceDetail(
          context.overview.aeo_readiness_gap_count,
          'readiness gap',
          context.overview.aeo_readiness_gap_affected_page_count,
        )
      : `${context.analyzed} pages analyzed`,
    href: '/issues?dimension=aeo',
    icon: ICONS.visibility,
  };
}

function occurrenceDetail(count: number, noun: string, affectedPages: number): string {
  const occurrenceLabel = count === 1 ? `${noun} occurrence` : `${noun} occurrences`;
  const pageLabel = affectedPages === 1 ? 'page' : 'pages';
  return `${count} ${occurrenceLabel} · ${affectedPages} ${pageLabel} affected`;
}

function measurementMetric(context: MetricContext): MetricModel {
  const source = context.overview ?? context.summary;
  const coverage = source?.aeo_measurement_coverage;
  const state = source?.aeo_measurement_state;
  return {
    title: 'AEO Checklist Completion',
    valueUnit: 'percent',
    value: percentRatio(coverage),
    caveat: measurementCaveat(state, coverage),
    detail: context.overview
      ? `${context.overview.measured_check_count} of ${context.overview.expected_check_count} checks completed`
      : 'Completed checks across applicable pillars',
    href: '/site?tab=aeo-readiness',
    icon: ICONS.reports,
  };
}

function crawlMetric(context: MetricContext): MetricModel {
  const progress = context.selected > 0 ? (100 * context.analyzed) / context.selected : null;
  const terminalCoverage = context.overview?.crawl_coverage;
  return {
    title: 'Crawl Coverage',
    value: progress,
    // The ring already shows the share and `detail` already counts the pages;
    // the only thing left worth saying is that the crawl did NOT finish.
    caveat: coverageCaveat(terminalCoverage, context.active),
    detail: terminalCoverage
      ? `${context.analyzed} of ${context.selected || PLACEHOLDER} pages analyzed${coverageReason(terminalCoverage.evidence)}`
      : `${context.analyzed} of ${context.selected || PLACEHOLDER} pages analyzed`,
    href: '/site?tab=pages',
    icon: ICONS.site,
  };
}

function coverageCaveat(
  coverage: SiteHealthOverview['crawl_coverage'] | undefined,
  active: boolean,
): string | null {
  if (!coverage) return active ? 'In progress' : 'Coverage unavailable';
  if (coverage.state === 'complete') return null;
  return coverage.state === 'partial' ? 'Partial coverage' : 'Coverage unknown';
}

function coverageReason(evidence: Record<string, unknown>): string {
  const reasons = evidence.reasons;
  if (!Array.isArray(reasons)) return '';
  const reason = reasons.find((value): value is string => typeof value === 'string');
  return reason ? ` · ${reason.replaceAll('_', ' ')}` : '';
}

function OverviewMetricCard({
  title,
  value,
  valueUnit = 'score',
  caveat,
  detail,
  href,
  icon: Icon,
}: Readonly<MetricModel>) {
  return (
    <div
      className={cn(hairlineBandItemClasses, 'grid h-full gap-4 p-4 sm:first:ps-4 sm:last:pe-4')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <Icon aria-hidden className="text-subtle size-4" />
          <p className={textRole('bodyStrong')}>{title}</p>
        </div>
        {value === null ? (
          <UnavailableValue state="not_measured" />
        ) : (
          <ScoreRing
            value={value}
            size={64}
            label={
              valueUnit === 'percent'
                ? `${title}: ${Math.round(value)}%`
                : `${title} score: ${Math.round(value)}`
            }
          />
        )}
      </div>
      <div className="grid gap-1">
        {caveat ? <p className="text-muted text-xs">{caveat}</p> : null}
        <p className="text-secondary text-xs">{detail}</p>
      </div>
      <Button asChild variant="ghost" size="sm" className="-ms-2.5 mt-auto justify-self-start">
        <ProjectLink href={href}>View details</ProjectLink>
      </Button>
    </div>
  );
}
