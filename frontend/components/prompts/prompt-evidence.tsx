import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AnswerDialog } from '@/components/runs/answer-dialog';
import { runsQueries } from '@/lib/api/runs';
import { useProjectScope } from '@/lib/project/active-project-scope';

/** Where the latest run asked one prompt: the run, and the prompt's place in it. */
export type PromptAnswerRef = Readonly<{ auditId: string; promptIndex: number }>;

type Opened = PromptAnswerRef & Readonly<{ promptId: string; promptText: string }>;

/**
 * The answer dialog for a prompt row: the answers the latest run got for that
 * prompt. It opens on the run's first succeeded answer to the prompt; the
 * dialog's own Engine filter reaches the others. The run's executions are
 * read only once a row asks.
 */
export function usePromptEvidence(): Readonly<{
  open: (prompt: Opened) => void;
  dialog: ReactNode;
}> {
  const { workspaceId } = useProjectScope();
  const [opened, setOpened] = useState<Opened | null>(null);
  const run = useQuery({
    ...runsQueries.executions(workspaceId, opened?.auditId ?? ''),
    enabled: opened !== null,
  });
  const answer = run.data?.find(
    (execution) =>
      execution.prompt_index === opened?.promptIndex && execution.status === 'succeeded',
  );
  // The run was read and holds no answer to this prompt, or could not be read.
  const missing = run.isError || (run.data !== undefined && !answer);
  return {
    open: setOpened,
    dialog: (
      <AnswerDialog
        execution={
          opened
            ? {
                // Null while the run is read: the dialog is already titled by its prompt.
                id: answer?.id ?? null,
                prompt_text: opened.promptText,
                prompt_index: opened.promptIndex,
                prompt_id: opened.promptId,
              }
            : null
        }
        open={opened !== null}
        unavailable={missing ? 'The latest run has no answer to show for this prompt.' : undefined}
        onOpenChange={(next) => {
          if (!next) setOpened(null);
        }}
      />
    ),
  };
}
