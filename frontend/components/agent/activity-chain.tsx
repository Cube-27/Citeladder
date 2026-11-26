import { FoldedTrail, type TrailStep } from '@/components/ui/rung-trail';
import type { ReactNode } from 'react';

import { Section, SectionContent } from '@/components/ui/section';
import { activityLabel, activitySummary, type ActivityRow } from '@/lib/agent/activity';

export function ActivityChain({ rows }: Readonly<{ rows: readonly ActivityRow[] }>) {
  if (rows.length === 0) return null;
  return (
    <ActivityPanel>
      <FoldedTrail
        summary={activitySummary(rows)}
        label="Agent activity"
        steps={activitySteps(rows)}
      />
    </ActivityPanel>
  );
}

export function ActivityPanel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Section>
      <SectionContent>{children}</SectionContent>
    </Section>
  );
}

export function activitySteps(rows: readonly ActivityRow[]): TrailStep[] {
  return rows.map((row) => ({
    id: row.key,
    label: activityLabel(row),
    detail: row.detail,
    status: row.state,
  }));
}
