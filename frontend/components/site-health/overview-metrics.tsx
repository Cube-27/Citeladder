import { ICONS } from '@/lib/icons';
import type { SiteCrawl, SiteHealthDashboard, SiteHealthOverview } from '@/lib/api/types';
import { measurementCaveat, shouldPollCrawl } from '@/lib/site-health/status';
import { AuditMetricStrip, type AuditMetric } from './audit-metric-strip';

type Summary = SiteHealthDashboard['score_summary'];
type MetricContext = {
  overview?: SiteHealthOverview;
  summary: Summary;
  analyzed: number;
  selected: number;
  active: boolean;
};
type MetricModel = AuditMetric;

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
  return <AuditMetricStrip metrics={metrics} testId="overview-metrics" />;
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
    href: '/issues?dimension=aeo',
    icon: ICONS.visibility,
  };
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
    caveat: coverageCaveat(terminalCoverage, context.active),
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
  const label = coverage.state === 'partial' ? 'Partial coverage' : 'Coverage unknown';
  const reasons = coverage.evidence.reasons;
  const reason = Array.isArray(reasons)
    ? reasons.find((value): value is string => typeof value === 'string')
    : undefined;
  return reason ? `${label} · ${reason.replaceAll('_', ' ')}` : label;
}
