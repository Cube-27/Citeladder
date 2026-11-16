import { flushSync } from 'react-dom';
import { X } from 'lucide-react';

import { GoalStrip } from '@/components/agent/actions-goal-strip';
import { ActionsPageContext, useActionsPageContext } from '@/components/agent/actions-page-context';
import { groupAnchor, levelKey, StatusSection } from '@/components/agent/actions-status-tree';
import { ActionsToolbar } from '@/components/agent/actions-toolbar';
import { useActionFilters } from '@/components/agent/use-action-filters';
import {
  useBulkDecision,
  useOpenLevels,
  useStatusTree,
  useTreeSelection,
} from '@/components/agent/use-actions-page';
import { ReportPage } from '@/components/templates/report-page';
import { Button, IconButton } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { SelectionDock } from '@/components/ui/selection-dock';
import { textRole } from '@/components/ui/typography';
import type { ActionStatus, ActionTree } from '@/lib/api/actions';
import { formatCount } from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';
import type { ActionGoal } from '@citeladder/contracts/actions';

/**
 * The Actions page (plan v3): status → goal → grouping → action, from one
 * tree read per open status. New opens on its first goal and that goal's
 * first grouping. Every level has a fixed height, so opening, closing,
 * ticking or deciding only changes what is below it.
 */
export function ActionsScreen() {
  const scope = useProjectScope();
  const view = useActionFilters();
  const lead: ActionStatus = view.statuses.includes('open') ? 'open' : (view.statuses[0] ?? 'open');
  const primary = useStatusTree(scope, view, lead);
  const levels = useOpenLevels(defaultOpen(lead, primary.data));
  const selection = useTreeSelection(JSON.stringify([view.status, view.groupBy, view.filters]));
  const counts = primary.data?.status_counts;

  const jump = (goal: ActionGoal) => {
    if (view.groupBy !== 'goal') view.setGroupBy('goal');
    flushSync(() => levels.open([levelKey.status(lead), levelKey.group(lead, goal)]));
    const row = document.getElementById(groupAnchor(lead, goal));
    row?.scrollIntoView({ block: 'start' });
    row?.focus({ preventScroll: true });
  };

  return (
    <ActionsPageContext value={{ scope, view, levels, selection }}>
      <ReportPage filters={<ActionsToolbar scope={scope} view={view} newCount={counts?.open} />}>
        <Stack gap="workspace" className="min-w-0">
          <Stack gap="tight">
            <h2 className={textRole('heading')}>Close the gaps keeping you out of AI answers</h2>
            <p className={textRole('body', 'text-ink-2')}>
              Start with site fixes. Then improve your pages, correct wrong claims and get mentioned
              elsewhere.
            </p>
          </Stack>
          <GoalStrip goals={primary.data?.goals} failed={primary.isError} onJump={jump} />
          <div>
            {view.statuses.map((status) => (
              <StatusSection key={status} status={status} count={counts?.[status]} />
            ))}
          </div>
        </Stack>
        <BulkBar />
      </ReportPage>
    </ActionsPageContext>
  );
}

/** New (or the one status shown), its first group and that group's first grouping. */
function defaultOpen(status: ActionStatus, tree: ActionTree | undefined): string[] {
  const first = tree?.groups[0];
  const grouping = first?.groupings[0];
  return [
    levelKey.status(status),
    ...(first ? [levelKey.group(status, first.key)] : []),
    ...(first && grouping ? [levelKey.grouping(status, first.key, grouping.grouping)] : []),
  ];
}

/** Accept or Decline what is ticked; the dock takes no space, so ticking moves nothing. */
function BulkBar() {
  const { scope, view, selection } = useActionsPageContext();
  const bulk = useBulkDecision(scope, view, selection);
  return (
    <SelectionDock
      label="Selected actions"
      summary={selection.size > 0 ? `${formatCount(selection.size)} selected` : null}
    >
      <Button variant="quiet" onClick={() => void bulk.decide('dismissed')} disabled={bulk.pending}>
        Decline
      </Button>
      <Button
        variant="primary"
        onClick={() => void bulk.decide('in_progress')}
        disabled={bulk.pending}
      >
        Accept
      </Button>
      <IconButton icon={X} label="Clear selection" onClick={selection.clear} />
    </SelectionDock>
  );
}
