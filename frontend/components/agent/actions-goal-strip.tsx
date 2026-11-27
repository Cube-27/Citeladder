import { FigureStrip } from '@/components/ui/figure-strip';
import { InfoHint } from '@/components/ui/info-hint';
import { Inline } from '@/components/ui/layout';
import { StatusMark } from '@/components/ui/status-mark';
import { Text } from '@/components/ui/typography';
import { formatCount } from '@/lib/format';
import {
  ACTION_GOAL_HINT,
  ACTION_GOAL_LABEL,
  goalCountPhrase,
  goalCountWords,
} from '@/lib/agent/vocabulary';
import type { ActionTree } from '@/lib/api/actions';
import { actionGoalSchema, type ActionGoal } from '@citeladder/contracts/actions';

export function GoalStrip({
  goals,
  failed,
  onJump,
}: Readonly<{
  goals: ActionTree['goals'] | undefined;
  failed: boolean;
  onJump: (goal: ActionGoal) => void;
}>) {
  return (
    <FigureStrip
      label="Goals"
      twoLineLabels
      segments={actionGoalSchema.options.map((goal) => {
        const entry = failed ? undefined : goals?.find((candidate) => candidate.goal === goal);
        const label = ACTION_GOAL_LABEL[goal];
        const phrase = entry ? goalCountPhrase(goal, entry.count) : null;
        return {
          key: goal,
          label: <Text variant="body">{label}</Text>,
          loading: !failed && !goals,
          value: entry ? (
            <Inline as="span" align="baseline" title={phrase ?? undefined}>
              <span className="shrink-0">{formatCount(entry.count)}</span>
              <Text variant="caption" box="shrink" wrap="truncate">
                {goalCountWords(goal, entry.count)}
              </Text>
            </Inline>
          ) : null,
          missingState: 'unavailable',
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
