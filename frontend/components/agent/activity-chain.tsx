import { ChainOfThought, ChainOfThoughtStep } from '@/components/ui/chain-of-thought';
import { activityLabel, activitySummary, type ActivityRow } from '@/lib/agent/activity';

/** A turn's activity, saved or live; nothing when no step is visible. */
export function ActivityChain({ rows }: Readonly<{ rows: readonly ActivityRow[] }>) {
  if (rows.length === 0) return null;
  return (
    <ChainOfThought summary={activitySummary(rows)} label="Agent activity">
      {rows.map((row) => (
        <ChainOfThoughtStep
          key={row.key}
          label={activityLabel(row)}
          detail={row.detail}
          status={row.state}
        />
      ))}
    </ChainOfThought>
  );
}
