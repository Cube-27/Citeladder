import { CountStrip, CountStripCell } from '@/components/ui/count-strip';
import { InfoHint } from '@/components/ui/info-hint';
import { StatusMark } from '@/components/ui/status-mark';
import { ACTION_GOAL_HINT, ACTION_GOAL_LABEL, goalCountPhrase } from '@/lib/agent/vocabulary';
import type { ActionTree } from '@/lib/api/actions';
import { actionGoalSchema, type ActionGoal } from '@citeladder/contracts/actions';

/**
 * The four goals, each its open count (New and In progress) with a ring; Let
 * AI read your site says Blocking while a critical fix is New. A cell jumps
 * to its goal and opens it.
 */
export function GoalStrip({
  goals,
  failed,
  onJump,
}: Readonly<{
  goals: ActionTree['goals'] | undefined;
  /** The read failed: counts say unavailable instead of loading or last known. */
  failed: boolean;
  onJump: (goal: ActionGoal) => void;
}>) {
  return (
    <CountStrip label="Goals">
      {actionGoalSchema.options.map((goal) => {
        // A failed refresh says Unavailable rather than showing the last counts as current.
        const entry = failed ? undefined : goals?.find((candidate) => candidate.goal === goal);
        const label = ACTION_GOAL_LABEL[goal];
        const phrase = entry ? goalCountPhrase(goal, entry.count) : null;
        return (
          <CountStripCell
            key={goal}
            label={label}
            mark={
              entry?.blocking ? (
                <StatusMark variant="severity" value="critical">
                  Blocking
                </StatusMark>
              ) : null
            }
            hint={<InfoHint label={`About ${label}`}>{ACTION_GOAL_HINT[goal]}</InfoHint>}
            value={phrase}
            failed={failed}
            pressLabel={`Go to ${label}${phrase ? `, ${phrase}` : ''}${entry?.blocking ? ', blocking' : ''}`}
            onPress={() => onJump(goal)}
          />
        );
      })}
    </CountStrip>
  );
}
