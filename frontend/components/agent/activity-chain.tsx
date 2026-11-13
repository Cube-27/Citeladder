import { ChainOfThought, ChainOfThoughtStep } from '@/components/ui/chain-of-thought';
import { activityLabel, activitySummary, type ActivityRow } from '@/lib/agent/activity';

/** A saved turn's activity; nothing when no step is visible. */
export function ActivityChain({ rows }: Readonly<{ rows: readonly ActivityRow[] }>) {
  if (rows.length === 0) return null;
  return (
    <ChainOfThought summary={activitySummary(rows)} label="Agent activity">
      <ActivitySteps rows={rows} />
    </ChainOfThought>
  );
}

/** One step per row, the same in a saved turn and the running one. */
export function ActivitySteps({ rows }: Readonly<{ rows: readonly ActivityRow[] }>) {
  return rows.map((row) => (
    <ChainOfThoughtStep
      key={row.key}
      label={activityLabel(row)}
      detail={row.detail}
      status={row.state}
    />
  ));
}
