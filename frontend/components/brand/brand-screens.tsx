import { ReportPage } from '@/components/templates/report-page';
import { StateBlock } from '@/components/ui/state-block';
import { ICONS } from '@/lib/icons';

// The Brand pages hold their place in the navigation until the AI visibility
// gaps plan (docs/plans/ai-visibility-gaps.md) builds them.

export function InsightsScreen() {
  return (
    <ReportPage>
      <StateBlock
        kind="empty"
        icon={ICONS.insights}
        heading="Insights is being built"
        description="Your visibility trend and brand ranking are on Sources, under Trends, until then."
      />
    </ReportPage>
  );
}

export function CompetitorsScreen() {
  return (
    <ReportPage>
      <StateBlock
        kind="empty"
        icon={ICONS.competitors}
        heading="Competitors is being built"
        description="Your competitor ranking is on Sources, under Trends, until then."
      />
    </ReportPage>
  );
}
