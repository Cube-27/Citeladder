import type { ReactNode } from 'react';

import { KpiRow, type StatSegment } from '@/components/ui/stat-row';
import { TextLink } from '@/components/ui/text-link';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { ICONS } from '@/lib/icons';
import type { SiteCrawl, SiteHealthDashboard, SiteHealthOverview } from '@citeladder/contracts';

/**
 * One Site Health figure as a `KpiRow` segment. A quality score (`score`) is
 * the ring with its number; a completion share (`percent`) is not a quality
 * score (owner, 10 Nov 2026), so it is a plain figure with the counts behind
 * it, no ring and no tone.
 */
export type AuditMetric = {
  title: string;
  value: number | null;
  valueUnit?: 'score' | 'percent';
  /** The counts behind a completion share, e.g. "20 of 100 found pages analyzed". */
  sub?: string;
  /** Where to act, named by where it goes. */
  link?: Readonly<{ href: string; label: string }>;
  icon: typeof ICONS.site;
  unavailable?: ReactNode;
};

function auditSegment({
  title,
  value,
  valueUnit = 'score',
  sub,
  link,
  icon,
  unavailable,
}: AuditMetric): StatSegment {
  const base = {
    key: title,
    label: title,
    icon,
    action: link ? <TextLink href={link.href}>{link.label}</TextLink> : undefined,
  };
  if (value === null) {
    return { ...base, value: unavailable ?? <UnavailableValue state="not_measured" /> };
  }
  if (valueUnit === 'percent') return { ...base, value: `${Math.round(value)}%`, sub };
  // The ring names itself "<label> score: <n> out of 100".
  return { ...base, score: { value, label: `${title} score` } };
}

/** The Site Health scores, as one `KpiRow`. */
export function AuditScores({
  metrics,
  testId,
}: Readonly<{ metrics: readonly AuditMetric[]; testId?: string }>) {
  return <KpiRow segments={metrics.map(auditSegment)} testId={testId} />;
}

type Summary = SiteHealthDashboard['score_summary'];
type MetricContext = {
  overview?: SiteHealthOverview;
  summary: Summary;
  analyzed: number;
  selected: number;
};

function percentRatio(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : value * 100;
}

/** "3 of 4 analyzed pages scored": `total` is never zero here. */
function ofPages(done: number, total: number, qualifier: string, outcome: string): string {
  return `${done} of ${total} ${qualifier} ${total === 1 ? 'page' : 'pages'} ${outcome}`;
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
  return <AuditScores metrics={metrics} testId="overview-metrics" />;
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
  };
}

function technicalMetric(context: MetricContext): AuditMetric {
  const source = context.overview ?? context.summary;
  return {
    title: 'Web Fundamentals',
    value: source?.web_fundamentals_score ?? null,
    link: { href: '/issues?dimension=technical', label: 'Open Web Fundamentals issues' },
    icon: ICONS.siteHealth,
  };
}

function aeoMetric(context: MetricContext): AuditMetric {
  const source = context.overview ?? context.summary;
  return {
    title: 'AEO Readiness',
    value: source?.aeo_readiness_score ?? null,
    link: { href: '/issues?dimension=aeo', label: 'Open AEO Readiness issues' },
    icon: ICONS.visibility,
  };
}

/**
 * The share of analyzed pages the AEO checklist could score. The site share
 * is scored pages over analyzed pages, so the count is that share of them.
 */
function measurementMetric(context: MetricContext): AuditMetric {
  const source = context.overview ?? context.summary;
  const value = percentRatio(source?.aeo_measurement_coverage);
  const pages = context.analyzed;
  return {
    title: 'AEO checklist completion',
    valueUnit: 'percent',
    value,
    sub:
      value === null || pages <= 0
        ? undefined
        : ofPages(Math.round((value / 100) * pages), pages, 'analyzed', 'scored'),
    link: { href: '/site?tab=aeo-readiness', label: 'Open AEO Readiness' },
    icon: ICONS.reports,
  };
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Found and analyzed pages: saved by the crawl, absent on older snapshots. */
function coverageCounts(coverage: SiteHealthOverview['crawl_coverage'] | undefined) {
  const evidence = coverage?.evidence ?? {};
  const found = count(evidence.observation_count);
  const analyzed = count(evidence.analyzed_url_count);
  if (found === null || analyzed === null) return null;
  return { found, analyzed };
}

/** Analyzed of found pages when the crawl saved both, else analyzed of selected. */
function crawlProgress(context: MetricContext) {
  const counts = coverageCounts(context.overview?.crawl_coverage);
  if (counts) {
    return { done: Math.min(counts.analyzed, counts.found), total: counts.found, of: 'found' };
  }
  return { done: context.analyzed, total: context.selected, of: 'selected' };
}

function crawlMetric(context: MetricContext): AuditMetric {
  // Share of the pages the crawl found, not of the pages it chose: 20 of 100 is not 100%.
  const progress = crawlProgress(context);
  const known = progress.total > 0;
  return {
    title: 'Crawl coverage',
    valueUnit: 'percent',
    value: known ? (100 * progress.done) / progress.total : null,
    sub: known ? ofPages(progress.done, progress.total, progress.of, 'analyzed') : undefined,
    link: { href: '/site?tab=pages', label: 'Open Pages' },
    icon: ICONS.site,
  };
}
