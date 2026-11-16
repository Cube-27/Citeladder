import { FoldedTrail, type TrailStep } from '@/components/ui/rung-trail';
import { activityLabel, activitySummary, type ActivityRow } from '@/lib/agent/activity';

/**
 * A reply's tool steps sit in a card, apart from its prose on the ground:
 * `surface`, a `rule` edge, radius 8, the card shadow, 12 by 16 inside.
 */
export const STEP_CARD = 'bg-surface border-rule rounded-card shadow-card min-w-0 border px-4 py-3';

/** A saved turn's activity; nothing when no step is visible. */
export function ActivityChain({ rows }: Readonly<{ rows: readonly ActivityRow[] }>) {
  if (rows.length === 0) return null;
  return (
    <div className={STEP_CARD}>
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
