import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Execution } from '@citeladder/contracts';
import { runsQueries } from '@/lib/api/runs';
import { useEngineCatalog } from '@/lib/providers/engines';

export type AnswerFilters = 'answer' | 'engine_repetition';

type AnswerFilter = Readonly<{
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  select: (value: string) => void;
}>;

function answerFilters(
  answers: readonly Execution[],
  activeId: string | null,
  input: { mode: AnswerFilters; label: (engine: string) => string; pick: (id: string) => void },
): AnswerFilter[] {
  if (activeId === null) return [];
  switch (input.mode) {
    case 'answer': {
      const options = answers.map((answer, index) => {
        const label = input.label(answer.logical_engine);
        const earlier = answers
          .slice(0, index)
          .filter((other) => other.logical_engine === answer.logical_engine).length;
        return { value: answer.id, label: earlier ? `${label} ${earlier + 1}` : label };
      });
      return options.length > 1
        ? [{ id: 'engine', label: 'Engine', value: activeId, options, select: input.pick }]
        : [];
    }
    case 'engine_repetition': {
      const active = answers.find((answer) => answer.id === activeId);
      if (!active) return [];
      const engines = [...new Set(answers.map((answer) => answer.logical_engine))];
      const repeats = answers
        .filter((answer) => answer.logical_engine === active.logical_engine)
        .sort((a, b) => a.repetition - b.repetition);
      const pickWhere = (match: (answer: Execution) => boolean, fallback: Execution[]) => {
        const next = answers.find(match) ?? fallback[0];
        if (next) input.pick(next.id);
      };
      return [
        {
          id: 'engine',
          label: 'Engine',
          value: active.logical_engine,
          options: engines.map((engine) => ({ value: engine, label: input.label(engine) })),
          select: (engine) =>
            pickWhere(
              (answer) =>
                answer.logical_engine === engine && answer.repetition === active.repetition,
              answers.filter((answer) => answer.logical_engine === engine),
            ),
        },
        {
          id: 'repetition',
          label: 'Repetition',
          value: String(active.repetition),
          options: repeats.map((answer) => ({
            value: String(answer.repetition),
            label: String(answer.repetition),
          })),
          select: (repetition) =>
            pickWhere(
              (answer) =>
                answer.logical_engine === active.logical_engine &&
                String(answer.repetition) === repetition,
              [],
            ),
        },
      ];
    }
    default: {
      const exhaustive: never = input.mode;
      return exhaustive;
    }
  }
}

export function usePromptEngineAnswers({
  workspaceId,
  executionId,
  enabled,
  filters = 'answer',
}: Readonly<{
  workspaceId: string | null;
  executionId: string | null;
  enabled: boolean;
  filters?: AnswerFilters;
}>) {
  const { label } = useEngineCatalog();
  const [picked, setPicked] = useState<Readonly<{ opened: string; id: string }> | null>(null);
  const opened = useQuery({
    ...runsQueries.execution(workspaceId, executionId),
    enabled: enabled && executionId !== null,
  });
  const run = useQuery({
    ...runsQueries.executions(workspaceId, opened.data?.audit_id ?? ''),
    enabled: enabled && opened.data !== undefined,
  });
  const promptIndex = opened.data?.prompt_index;
  const answers = (run.data ?? []).filter(
    (execution) => execution.prompt_index === promptIndex && execution.status === 'succeeded',
  );
  const pickedId = picked !== null && picked.opened === executionId ? picked.id : null;
  const activeId = answers.some((answer) => answer.id === pickedId) ? pickedId : executionId;
  const pick = (id: string) => {
    if (executionId !== null) setPicked({ opened: executionId, id });
  };
  return {
    activeId,
    shown: run.data?.find((execution) => execution.id === activeId) ?? null,
    filters: answerFilters(answers, activeId, { mode: filters, label, pick }),
  };
}
