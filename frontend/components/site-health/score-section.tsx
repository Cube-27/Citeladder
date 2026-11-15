import type { SiteCrawl, SiteHealthDashboard } from '@citeladder/contracts';
import { Absence } from '@/components/ui/absence';
import { ICONS } from '@/lib/icons';
import { AuditScores } from './overview-metrics';

export function ScoreSection({
  crawl,
  dashboard,
}: Readonly<{ crawl: SiteCrawl | null; dashboard: SiteHealthDashboard | undefined }>) {
  const summary = dashboard?.score_summary ?? crawl?.score_summary ?? null;
  const coverage = summary?.aeo_measurement_coverage;
  return (
    <AuditScores
      testId="score-section"
      metrics={[
        {
          title: 'Web fundamentals',
          value: summary?.web_fundamentals_score ?? null,
          unavailable: unavailable(summary?.web_fundamentals_state),
          icon: ICONS.siteHealth,
          href: '/issues?section=technical',
        },
        {
          title: 'AEO readiness',
          value: summary?.aeo_readiness_score ?? null,
          unavailable: unavailable(summary?.aeo_measurement_state),
          icon: ICONS.visibility,
          href: '/issues?section=aeo',
        },
        {
          title: 'AEO checklist completion',
          value: coverage == null ? null : coverage * 100,
          valueUnit: 'percent',
          unavailable: unavailable(summary?.aeo_measurement_state),
          icon: ICONS.reports,
          href: '/site?tab=aeo-readiness',
        },
      ]}
    />
  );
}
function unavailable(state?: string) {
  if (state === 'limited_evidence')
    return <Absence state="not_measured" label="Limited evidence" />;
  if (state === 'excluded') return <Absence state="excluded" />;
  return <Absence state="not_measured" />;
}
