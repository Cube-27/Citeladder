'use client';

import { useState } from 'react';

import { DimensionTable } from './dimension-table';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { textRole } from '@/components/ui/typography';
import type { PerformanceDimension } from '@/lib/api/performance';
import { BING_DIMENSION_TABS } from '@/lib/performance/performance';
import { cn } from '@/lib/utils';

/**
 * Bing Webmaster Tools, in a panel of its own.
 *
 * Bing is a SECOND search engine measuring a different population, so its
 * clicks and impressions are never added to the Search Console cards, never
 * drawn on the same chart, and never given a column on a Search Console
 * table. Summing them would silently change what every existing number means
 * and would leave CTR and average position undefined across two engines.
 *
 * The panel renders only when the project actually has a Bing connection:
 * "we never imported Bing" and "Bing measured nothing" are different answers
 * (invariant 7), and an always-present empty panel would state the second
 * while meaning the first.
 */
export function BingPanel({
  projectId,
  snapshotId,
  compareSnapshotId,
  selectedLabel,
  compareLabel,
}: Readonly<{
  projectId: string;
  snapshotId: string;
  compareSnapshotId: string | null;
  selectedLabel: string;
  compareLabel: string;
}>) {
  const [dimension, setDimension] = useState<PerformanceDimension>('bing_query');

  return (
    <section className="grid gap-3" aria-label="Bing performance" data-testid="bing-panel">
      <div className="grid gap-0.5">
        <h2 className={textRole('sectionTitle')}>Bing</h2>
        <p className={cn(textRole('meta'))}>
          Bing Webmaster Tools, counted separately. These figures are never added to the Search
          Console totals above.
        </p>
      </div>
      <Tabs
        value={dimension}
        onValueChange={(value) => setDimension(value as PerformanceDimension)}
        items={BING_DIMENSION_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
        ariaLabel="Bing breakdowns"
        rootClassName="grid gap-3"
        fill
      >
        {BING_DIMENSION_TABS.map((tab) => (
          <TabPanel key={tab.value} value={tab.value} className="focus-ring">
            {dimension === tab.value ? (
              <DimensionTable
                projectId={projectId}
                dimension={tab.value}
                snapshotId={snapshotId}
                compareSnapshotId={compareSnapshotId}
                selectedLabel={selectedLabel}
                compareLabel={compareLabel}
              />
            ) : null}
          </TabPanel>
        ))}
      </Tabs>
    </section>
  );
}
