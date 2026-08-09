'use client';

import { useState } from 'react';

import { InventorySection } from '@/components/site-health/inventory-section';
import { PageKindScores } from '@/components/site-health/page-kind-scores';
import { PhaseControls } from '@/components/site-health/phase-controls';
import { ScoreSection } from '@/components/site-health/score-section';
import { SiteFactsPanel } from '@/components/site-health/site-facts-panel';
import { StatusStrip } from '@/components/site-health/status-strip';
import type { useSiteHealthScreen } from '@/lib/site-health/use-site-health-screen';
import type { SiteHealthEntitlement } from '@/lib/api/types';
import type { PhaseMutation } from '@/components/site-health/phase-controls';

const EMPTY_URL_SELECTION: ReadonlySet<string> = new Set();

/**
 * The canonical Site Health dashboard layout.
 *
 * ONE composed screen that stays mounted through the entire discover → select
 * → analyze → scored lifecycle: the controls, a compact status/progress row,
 * the page inventory, and secondary score diagnostics. Phase changes update each section's DATA and
 * mode — they never swap the layout for a different panel, so starting,
 * cancelling, or finishing a crawl visibly updates the screen the user is
 * already on. (The per-URL crawl detail view and the issues screen remain the
 * only other screens in the flow.)
 */
export function SiteHealthDashboardLayout({
  screen,
  entitlement,
  projectId,
  onRecrawl,
}: Readonly<{
  screen: ReturnType<typeof useSiteHealthScreen>;
  entitlement: SiteHealthEntitlement;
  projectId: string;
  onRecrawl: () => void;
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
    cancelMutation,
    cancelCrawl,
    startCrawl,
  } = screen;
  const [urlSelection, setUrlSelection] = useState<{
    crawlId: string | undefined;
    ids: Set<string>;
  }>({ crawlId: crawl?.id, ids: new Set() });
  const [lastPhaseMutation, setLastPhaseMutation] = useState<PhaseMutation | null>(null);
  const selectedUrlIds =
    urlSelection.crawlId === crawl?.id ? urlSelection.ids : EMPTY_URL_SELECTION;

  return (
    <div className="grid gap-6" data-testid="site-health-canonical">
      {/* Keep the current state and actions first. Score and crawler diagnostics
          are reference material, not prerequisites for working with URLs. */}
      <StatusStrip
        crawl={crawl}
        phase={phase}
        entitlement={entitlement}
        cancelPending={cancelMutation.isPending}
        startPending={startPending}
        pages={pagesQuery.data?.items ?? []}
        selectedTotal={projectSelectedTotal}
        selectedError={projectSelectedError}
      />

      <PhaseControls
        screen={screen}
        selectedUrlIds={selectedUrlIds}
        lastMutation={lastPhaseMutation}
        onMutationStart={setLastPhaseMutation}
        onRecrawl={onRecrawl}
      />

      <InventorySection
        mode={inventoryMode}
        crawl={crawl}
        entitlement={entitlement}
        projectId={projectId}
        active={active}
        onCancel={cancelCrawl}
        cancelPending={cancelMutation.isPending}
        onStartAnalysis={startCrawl}
        // Disabled while the create request is in flight so a second click can
        // never fire a duplicate. There is no post-success gap to cover: the
        // create writes the new crawl into the dashboard cache itself.
        startPending={startPending}
      />

      {/* Secondary diagnostics follow the URL workspace. */}
      <ScoreSection
        crawl={crawl}
        dashboard={dashboardQuery.data}
        pages={pagesQuery.data?.items ?? []}
        // Live running-mean fallback applies whenever analysis may still be
        // producing scores — the analyzing phase, and an ACTIVE crawl already
        // showing a mid-run dashboard projection (phase 'dashboard' via
        // hasScoreData with null metric fields).
        analyzing={phase === 'analyzing' || (phase === 'dashboard' && active)}
        selectedTotal={projectSelectedTotal}
      />

      <PageKindScores
        key={crawl?.id ?? 'no-crawl'}
        crawl={crawl}
        dashboard={dashboardQuery.data}
        selectedUrlIds={selectedUrlIds}
        onSelectionChange={(ids) => setUrlSelection({ crawlId: crawl?.id, ids })}
        onReanalyze={
          entitlement.advanced_controls_enabled
            ? (siteUrlIds) => {
                const selectionVersion = screen.monitoredQuery.data?.selection_version;
                if (!crawl || selectionVersion === undefined || siteUrlIds.length === 0) return;
                setLastPhaseMutation('startAnalysis');
                screen.startAnalysisMutation.mutate({
                  crawlId: crawl.id,
                  input: {
                    requested_url_count: siteUrlIds.length,
                    site_url_ids: siteUrlIds,
                    expected_selection_version: selectionVersion,
                  },
                });
              }
            : undefined
        }
        reanalyzePending={screen.startAnalysisMutation.isPending}
      />
      <SiteFactsPanel crawl={crawl} dashboard={dashboardQuery.data} />
    </div>
  );
}
