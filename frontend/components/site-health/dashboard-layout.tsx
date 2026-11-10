import { InventorySection } from '@/components/site-health/inventory-section';
import { PageKindScores } from '@/components/site-health/page-kind-scores';
import { SiteFactsPanel } from '@/components/site-health/site-facts-panel';
import { StatusStrip } from '@/components/site-health/status-strip';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/ui/query-state';
import { Stack } from '@/components/ui/layout';
import type { useSiteHealthScreen } from '@/lib/site-health/use-site-health-screen';
import type { SiteHealthEntitlement } from '@citeladder/contracts';
import { ICONS } from '@/lib/icons';

/**
 * The canonical Site Health dashboard layout.
 *
 * ONE composed screen that stays mounted through the entire discover → analyze
 * → scored lifecycle. Phase changes update each section's DATA and
 * mode — they never swap the layout for a different panel, so starting,
 * cancelling, or finishing a crawl visibly updates the screen the user is
 * already on. (The per-URL crawl detail view and the issues screen remain the
 * only other screens in the flow.)
 *
 * Reading order is answer-first: one status line (where the crawl stands, its
 * headline scores and page counts), the URL inventory, then page-kind
 * diagnostics. The inventory's view switch and page-kind filter sit directly
 * above its table.
 */
export function SiteHealthDashboardLayout({
  screen,
  entitlement,
  mutationsAllowed = true,
}: Readonly<{
  screen: ReturnType<typeof useSiteHealthScreen>;
  entitlement: SiteHealthEntitlement;
  mutationsAllowed?: boolean;
}>) {
  const {
    phase,
    inventoryMode,
    crawl,
    active,
    dashboardQuery,
    pagesQuery,
    projectSelectedTotal,
    projectSelectedError,
    startPending,
    startCrawl,
    cancelMutation,
  } = screen;

  return (
    // `min-w-0` so a wide table inside a section scrolls in its own wrapper
    // instead of widening this column (and every ancestor) to its max-content.
    <Stack gap="workspace" className="min-w-0" data-testid="site-health-canonical">
      {!crawl ? (
        <div data-testid="site-health-empty">
          <QueryState
            kind="empty"
            icon={ICONS.siteHealth}
            heading="Run your first site crawl"
            description="Crawl your site to see page health, issues, and recommendations as results arrive."
            action={
              <Button
                variant="primary"
                onClick={() => startCrawl()}
                disabled={startPending || !mutationsAllowed}
              >
                {startPending ? 'Starting…' : 'Run new crawl'}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Where the crawl stands, its headline scores and page counts:
              one line (the Overview tab keeps the score cards). */}
          <StatusStrip
            crawl={crawl}
            phase={phase}
            scoreSummary={dashboardQuery.data?.score_summary ?? crawl.score_summary ?? null}
            entitlement={entitlement}
            cancelPending={cancelMutation.isPending}
            startPending={startPending}
            pages={pagesQuery.data?.items ?? []}
            selectedTotal={projectSelectedTotal}
            selectedError={projectSelectedError}
            onRerun={mutationsAllowed ? () => startCrawl() : undefined}
          />

          <InventorySection mode={inventoryMode} crawl={crawl} active={active} />

          <PageKindScores crawl={crawl} dashboard={dashboardQuery.data} />

          <SiteFactsPanel crawl={crawl} dashboard={dashboardQuery.data} />
        </>
      )}
    </Stack>
  );
}
