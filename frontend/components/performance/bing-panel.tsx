import { useState } from 'react';

import { DimensionTable, useWarmDimensionTable } from './dimension-table';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';
import type { PerformanceDashboard, PerformanceDimension } from '@/lib/api/performance';
import { BING_DIMENSION_TABS } from '@/lib/performance/performance';

export function BingPanel({
  projectId,
  snapshotId,
  compareSnapshotId,
  dimensionCounts,
  selectedLabel,
  compareLabel,
}: Readonly<{
  projectId: string;
  snapshotId: string;
  compareSnapshotId: string | null;
  dimensionCounts: PerformanceDashboard['dimension_counts'];
  selectedLabel: string;
  compareLabel: string;
}>) {
  const [dimension, setDimension] = useState<PerformanceDimension>('bing_query');
  const warm = useWarmDimensionTable(projectId);

  return (
    <Section aria-label="Bing performance" data-testid="bing-panel">
      <SectionHeader>
        <SectionTitle>Bing</SectionTitle>
      </SectionHeader>
      <Tabs
        value={dimension}
        onValueChange={setDimension}
        items={BING_DIMENSION_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
        ariaLabel="Bing breakdowns"
        onIntent={(next) => warm({ snapshotId, compareSnapshotId }, next)}
      >
        {BING_DIMENSION_TABS.map((tab) => (
          <TabPanel key={tab.value} value={tab.value}>
            {dimension === tab.value ? (
              <DimensionTable
                projectId={projectId}
                dimension={tab.value}
                snapshotId={snapshotId}
                compareSnapshotId={compareSnapshotId}
                measuredRows={dimensionCounts[tab.value]}
                selectedLabel={selectedLabel}
                compareLabel={compareLabel}
              />
            ) : null}
          </TabPanel>
        ))}
      </Tabs>
    </Section>
  );
}
