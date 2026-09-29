'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { promptsApi } from '@/lib/api/prompts';
import { queryKeys } from '@/lib/api/query-keys';
import { humanizeApiError } from '@/lib/api/errors';
import { admissionDropSummary } from '@/lib/prompts/admission';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { usePromptSet } from '@/lib/prompts/use-prompt-set';
import { PROMPTS_REVIEW_HREF } from '@/lib/prompts/routes';

const PROPOSAL_FENCE = /^[ \t]*```json[ \t]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gim;

/** The proposal's rows when a fenced block holds a submittable shape, else null. */
function proposalRows(json: string): unknown[] | null {
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object' || !('prompts' in value)) return null;
    const rows = value.prompts;
    const submittable =
      Array.isArray(rows) &&
      rows.length > 0 &&
      rows.every(
        (row: unknown) =>
          !!row &&
          typeof row === 'object' &&
          ['topic_id', 'text', 'buyer_stage', 'prompt_intent'].every(
            (key) => typeof (row as Record<string, unknown>)[key] === 'string',
          ),
      );
    return submittable ? rows : null;
  } catch {
    return null;
  }
}

/**
 * Keep submission metadata out of the readable report; editing retains it.
 * A malformed or empty proposal stays visible so the user can repair it.
 */
export function promptPortfolioReport(body: string): string {
  return body.replace(PROPOSAL_FENCE, (block, json: string) => (proposalRows(json) ? '' : block));
}

/** How many questions the portfolio proposes (0 when it has no submittable block). */
export function proposedQuestionCount(body: string): number {
  return [...body.matchAll(PROPOSAL_FENCE)].reduce(
    (total, match) => total + (proposalRows(match[1]!)?.length ?? 0),
    0,
  );
}

/** Explicitly stage the saved revision; activation remains in candidate review. */
export function PromptProposalAction({
  workspaceId,
  revisionId,
  body,
  disabled,
}: Readonly<{
  workspaceId: string;
  revisionId: string;
  body: string;
  disabled: boolean;
}>) {
  const { ensurePromptSet } = usePromptSet();
  const client = useQueryClient();
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const stage = useMutation({
    mutationFn: async () => {
      const set = await ensurePromptSet();
      // Keep every approved question eligible; the default count would
      // silently trim a larger portfolio.
      const count = proposedQuestionCount(body);
      const result = await promptsApi.generate(
        set.id,
        { agent_revision_id: revisionId, ...(count ? { count } : {}) },
        { workspaceId },
      );
      await client.invalidateQueries({ queryKey: queryKeys.prompts.all });
      if (!result.candidates.length)
        throw new Error(
          [
            'No new questions passed admission.',
            admissionDropSummary(result.admission_drops),
            'Refine the portfolio or review suggestions already in Prompts.',
          ]
            .filter(Boolean)
            .join(' '),
        );
      navigate(projectHref(PROMPTS_REVIEW_HREF));
    },
  });
  return (
    <div className="grid gap-2">
      {stage.isError ? <Alert tone="warning">{humanizeApiError(stage.error).message}</Alert> : null}
      <Button
        className="justify-self-start"
        disabled={disabled}
        pending={stage.isPending}
        pendingLabel="Checking questions…"
        onClick={() => stage.mutate()}
      >
        Review in Prompts
      </Button>
    </div>
  );
}
