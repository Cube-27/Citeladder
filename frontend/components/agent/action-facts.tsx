import { FactList, type Fact } from '@/components/ui/facts';
import { TitledSection } from '@/components/ui/section';
import { ACTION_PROGRESS, Impact, scopeLabel, sourceLabel } from '@/components/agent/actions-rows';
import { ProgressGlyph } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import {
  ACTION_GOAL_LABEL,
  ACTION_GROUPING_LABEL,
  ACTION_MEASUREMENT_LABEL,
  ACTION_STATUS_LABEL,
} from '@/lib/agent/vocabulary';
import type { ActionDetail } from '@/lib/api/actions';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { UrlText } from '@/components/ui/table';
import { formatDisplayDate } from '@/lib/format';
import { ClampText } from '@/components/ui/clamp-text';

function StatusValue({
  action,
}: Readonly<{ action: Pick<ActionDetail, 'status' | 'measurement' | 'declaration'> }>) {
  const checked =
    !!action.declaration &&
    !action.declaration.resolved_before_snapshot_id &&
    action.declaration.checks.length > 0;
  return (
    <>
      <ProgressGlyph value={ACTION_PROGRESS[action.status]} />
      {ACTION_STATUS_LABEL[action.status]}
      {action.status === 'done' && action.measurement && checked ? (
        <Tag>{ACTION_MEASUREMENT_LABEL[action.measurement]}</Tag>
      ) : null}
    </>
  );
}

export function ActionFacts({ action }: Readonly<{ action: ActionDetail }>) {
  const timeZone = useDisplayTimeZone();
  const placement = action.target_kind === 'earned_page';
  const crawl = action.cohort?.crawl_completed_at;
  let source = sourceLabel(action);
  if (crawl) source = `${source} · crawl of ${formatDisplayDate(crawl, timeZone)}`;
  const facts: Fact[] = [
    { label: 'Status', value: <StatusValue action={action} /> },
    { label: 'Impact', value: <Impact band={action.priority_band} /> },
  ];
  if (!placement) facts.push({ label: 'Scope', value: scopeLabel(action) });
  facts.push({
    label: 'Source',
    value:
      placement && action.target_url ? (
        <span className="flex min-w-0">
          <UrlText url={action.target_url} />
        </span>
      ) : (
        <ClampText>{source}</ClampText>
      ),
  });
  if (!placement)
    facts.push({
      label: 'Grouping',
      value: `${ACTION_GOAL_LABEL[action.goal]} › ${ACTION_GROUPING_LABEL[action.grouping]}`,
    });
  return (
    <TitledSection region title="Details">
      <FactList facts={facts} layout="ruled" />
    </TitledSection>
  );
}
