import { AlertTriangle, ArrowUpRight, Split, Zap, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { UnavailableValue } from '@/components/ui/unavailable-value';
import { MetricGroup, MetricItem } from '@/components/ui/workspace';
import type { DemandSnapshot } from '@/lib/api/demand';
import { countByTab, isActionableGap, numericMetric } from '@/lib/demand/signals';
import { formatCount } from '@/lib/format';

function KpiSegment({
  label,
  value,
  caption,
  icon: Icon,
}: Readonly<{
  label: string;
  value: ReactNode;
  caption: string;
  icon: LucideIcon;
}>) {
  return (
    <MetricItem
      label={label}
      value={value}
      detail={caption}
      // Decorative category marks take neutral ink; the label names the metric.
      marker={<Icon className="text-muted size-4 shrink-0" aria-hidden="true" />}
    />
  );
}

/**
 * Impressions across every non-branded (actionable) signal. With no such
 * signal the sum is a true zero; when signals exist but none reported
 * impressions it was not measured, which is not zero.
 */
function latentImpressions(snapshot: DemandSnapshot): ReactNode {
  const observed = snapshot.signals
    .filter(isActionableGap)
    .map((signal) => numericMetric(signal, 'impressions'));
  const known = observed.filter((value): value is number => value !== null);
  if (observed.length > 0 && known.length === 0) return <UnavailableValue state="not_measured" />;
  return formatCount(known.reduce((sum, value) => sum + value, 0));
}

export function DemandSummaryCards({ snapshot }: Readonly<{ snapshot: DemandSnapshot }>) {
  const { signals } = snapshot;
  return (
    <MetricGroup>
      <KpiSegment
        label="Latent demand"
        value={latentImpressions(snapshot)}
        caption="Impressions on non-branded signals"
        icon={Zap}
      />
      <KpiSegment
        label="Striking distance"
        value={formatCount(countByTab(signals, 'striking_distance'))}
        caption="Queries at positions 4–15"
        icon={ArrowUpRight}
      />
      <KpiSegment
        label="Cannibalization"
        value={formatCount(countByTab(signals, 'cannibalization'))}
        caption="Queries split across your pages"
        icon={Split}
      />
      <KpiSegment
        label="CTR gaps"
        value={formatCount(countByTab(signals, 'ctr_gap'))}
        caption="Clicked less than their position earns"
        icon={AlertTriangle}
      />
    </MetricGroup>
  );
}
