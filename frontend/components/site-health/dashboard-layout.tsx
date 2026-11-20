import { InventorySection } from '@/components/site-health/inventory-section';
import { ScoreSection } from '@/components/site-health/score-section';
import { PageKindScores } from '@/components/site-health/page-kind-scores';
import { SiteFactsPanel } from '@/components/site-health/site-facts-panel';
import { Stack } from '@/components/ui/layout';
import type { useSiteHealthScreen } from '@/lib/site-health/use-site-health-screen';

/**
 * The Pages tab.
 *
 * ONE composed screen that stays mounted through the entire discover → analyze
 * → scored lifecycle. Phase changes update each section's DATA and
 * mode — they never swap the layout for a different panel, so starting,
 * cancelling, or finishing a crawl visibly updates the screen the user is
 * already on. (The per-URL crawl detail view and the issues screen remain the
 * only other screens in the flow.)
 *
 * Under the screen's status line: the figure strip (scores and page counts),
 * the URL inventory, then page-kind diagnostics. The inventory's view switch,
 * page-kind filter and export lead its table's own toolbar.
 */
export function SiteHealthDashboardLayout({
  screen,
  mutationsAllowed = true,
}: Readonly<{
  screen: ReturnType<typeof useSiteHealthScreen>;
  mutationsAllowed?: boolean;
}>) {
  const { inventoryMode, crawl, active, dashboardQuery, runExport, exporting } = screen;
  // Before the first crawl the screen shows its first-crawl state on every tab.
  if (!crawl) return null;

  return (
    // `min-w-0` so a wide table inside a section scrolls in its own wrapper
    // instead of widening this column (and every ancestor) to its max-content.
    <Stack gap="workspace" className="min-w-0" data-testid="site-health-canonical">
      <ScoreSection crawl={crawl} dashboard={dashboardQuery.data} />

      <InventorySection
        mode={inventoryMode}
        crawl={crawl}
        active={active}
        exportPages={
          mutationsAllowed
            ? { onExport: () => void runExport('csv', 'pages'), exporting }
            : undefined
        }
      />

      <PageKindScores crawl={crawl} dashboard={dashboardQuery.data} />

      <SiteFactsPanel crawl={crawl} dashboard={dashboardQuery.data} />
    </Stack>
  );
}
