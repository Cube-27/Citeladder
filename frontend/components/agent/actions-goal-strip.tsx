import { FigureStrip } from '@/components/ui/figure-strip';
import { InfoHint } from '@/components/ui/info-hint';
import { StatusMark } from '@/components/ui/status-mark';
import { availabilityLabel } from '@/lib/format';
import { ACTION_GOAL_HINT, ACTION_GOAL_LABEL, goalCountPhrase } from '@/lib/agent/vocabulary';
import type { ActionTree } from '@/lib/api/actions';
import { actionGoalSchema, type ActionGoal } from '@citeladder/contracts/actions';

/**
 * The four goals as one FigureStrip, each its open count (New and In
 * progress); Let AI read your site says Blocking while a critical fix is New.
 * A figure jumps to its goal and opens it.
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
    <FigureStrip
      label="Goals"
      twoLineLabels
      segments={actionGoalSchema.options.map((goal) => {
        // A failed refresh says Unavailable rather than showing the last counts as current.
        const entry = failed ? undefined : goals?.find((candidate) => candidate.goal === goal);
        const label = ACTION_GOAL_LABEL[goal];
        const phrase = entry ? goalCountPhrase(goal, entry.count) : null;
        return {
          key: goal,
          label,
          loading: !failed && !goals,
          value: phrase,
          missingLabel: availabilityLabel('unavailable'),
          marker: (
            <>
              {entry?.blocking ? (
                <StatusMark variant="severity" value="critical">
                  Blocking
                </StatusMark>
              ) : null}
              <InfoHint label={`About ${label}`}>{ACTION_GOAL_HINT[goal]}</InfoHint>
            </>
          ),
          actionLabel: [`Go to ${label}`, phrase, entry?.blocking ? 'blocking' : null]
            .filter(Boolean)
            .join(', '),
          onSelect: () => onJump(goal),
        };
      })}
    />
  );
}
