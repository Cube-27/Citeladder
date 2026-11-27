import type { ReactNode } from 'react';

import { Inline } from '@/components/ui/layout';
import { SectionBleed } from '@/components/ui/section';
import type { PerformanceMetricKey } from '@/lib/performance/performance';

import './metric-tiles.css';

export const METRIC_COLOR = {
  clicks: 'var(--color-metric-clicks)',
  impressions: 'var(--color-metric-impressions)',
  ctr: 'var(--color-metric-ctr)',
  position: 'var(--color-metric-position)',
} as const satisfies Record<PerformanceMetricKey, string>;

const METRIC_INK: Partial<Record<PerformanceMetricKey, string>> = {
  position: 'var(--text-color-metric-ink-dark)',
};

export function MetricTiles({
  label,
  testId,
  children,
}: Readonly<{ label: string; testId?: string; children: ReactNode }>) {
  return (
    <SectionBleed>
      <fieldset aria-label={label} data-testid={testId} className="metric-tiles">
        {children}
      </fieldset>
    </SectionBleed>
  );
}

export function MetricTile({
  metric,
  on,
  toggle,
  help,
  children,
}: Readonly<{
  metric: PerformanceMetricKey;
  on: boolean;
  toggle: ReactNode;
  help: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div
      data-metric={metric}
      data-on={on || undefined}
      className="metric-tile"
      style={{ '--metric': METRIC_COLOR[metric], '--metric-ink': METRIC_INK[metric] }}
    >
      <Inline justify="between">
        {toggle}
        <span data-metric-help="">{help}</span>
      </Inline>
      {children}
    </div>
  );
}
