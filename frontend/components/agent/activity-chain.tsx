import { FoldedTrail, type TrailStep } from '@/components/ui/rung-trail';
import { STEP_SLIP } from '@/components/ui/slip';
import { activityLabel, activitySummary, type ActivityRow } from '@/lib/agent/activity';

/** A saved turn's activity, in its step slip; nothing when no step is visible. */
export function ActivityChain({ rows }: Readonly<{ rows: readonly ActivityRow[] }>) {
  if (rows.length === 0) return null;
  return (
    <div className={STEP_SLIP}>
      <FoldedTrail
        summary={activitySummary(rows)}
        label="Agent activity"
        steps={activitySteps(rows)}
      />
    </div>
  );
}

/** One rung per row, the same in a saved turn and the running one. */
export function activitySteps(rows: readonly ActivityRow[]): TrailStep[] {
  return rows.map((row) => ({
    id: row.key,
    label: activityLabel(row),
    detail: row.detail,
    status: row.state,
  }));
}
