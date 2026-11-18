import { DetailsFacts, type DetailFact } from '@/components/ui/reading-page';
import { Impact, scopeLabel, sourceLabel } from '@/components/agent/actions-rows';
import { StateDot, type StateDotTone } from '@/components/ui/state-dot';
import { Tag } from '@/components/ui/tag';
import {
  ACTION_GOAL_LABEL,
  ACTION_GROUPING_LABEL,
  ACTION_MEASUREMENT_LABEL,
  ACTION_STATUS_LABEL,
} from '@/lib/agent/vocabulary';
import type { ActionDetail, ActionStatus } from '@/lib/api/actions';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate, readableUrl } from '@/lib/format';

const TONE: Record<ActionStatus, StateDotTone> = {
  open: 'open',
  in_progress: 'active',
  done: 'done',
  dismissed: 'declined',
};

/** A status as its ring and word; Done carries its measurement badge too. */
function StatusValue({
  action,
}: Readonly<{ action: Pick<ActionDetail, 'status' | 'measurement'> }>) {
  return (
    <>
      <StateDot tone={TONE[action.status]} />
      {ACTION_STATUS_LABEL[action.status]}
      {action.status === 'done' && action.measurement ? (
        <Tag>{ACTION_MEASUREMENT_LABEL[action.measurement]}</Tag>
      ) : null}
    </>
  );
}

/**
 * The Action's Details facts: Status, Impact, Scope, Source (with its crawl
 * for Site health) and Grouping. A placement names the page it is won on as
 * its source and has no scope or grouping, as the mockup's cited page.
 */
export function ActionFacts({ action }: Readonly<{ action: ActionDetail }>) {
  const timeZone = useDisplayTimeZone();
  const placement = action.target_kind === 'earned_page';
  const crawl = action.cohort?.crawl_completed_at;
  let source = sourceLabel(action);
  if (placement && action.target_url) source = readableUrl(action.target_url);
  else if (crawl) source = `${source} · crawl of ${formatDisplayDate(crawl, timeZone)}`;
  const facts: DetailFact[] = [
    { label: 'Status', value: <StatusValue action={action} /> },
    { label: 'Impact', value: <Impact band={action.priority_band} /> },
  ];
  if (!placement) facts.push({ label: 'Scope', value: scopeLabel(action) });
  facts.push({ label: 'Source', value: <span className="min-w-0 truncate">{source}</span> });
  if (!placement)
    facts.push({
      label: 'Grouping',
      value: `${ACTION_GOAL_LABEL[action.goal]} › ${ACTION_GROUPING_LABEL[action.grouping]}`,
    });
  return <DetailsFacts facts={facts} />;
}
