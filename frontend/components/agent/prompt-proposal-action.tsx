'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { promptsApi } from '@/lib/api/prompts';
import { queryKeys } from '@/lib/api/query-keys';
import { humanizeApiError } from '@/lib/api/errors';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { usePromptSet } from '@/lib/prompts/use-prompt-set';
import { PROMPTS_REVIEW_HREF } from '@/lib/prompts/routes';

/** Keep submission metadata out of the readable report; editing retains it. */
export function promptPortfolioReport(body: string): string {
  return body.replace(/^```json\s*\n([\s\S]*?)^```\s*$/gm, (block, json: string) => {
    try {
      const value: unknown = JSON.parse(json);
      if (
        value &&
        typeof value === 'object' &&
        'prompts' in value &&
        Array.isArray(value.prompts)
      ) {
        return '';
      }
    } catch {
      // A malformed proposal stays visible so the user can repair it.
    }
    return block;
  });
}

/** Explicitly stage the saved revision; activation remains in candidate review. */
export function PromptProposalAction({
  workspaceId,
  revisionId,
  disabled,
}: Readonly<{
  workspaceId: string;
  revisionId: string;
  disabled: boolean;
}>) {
  const { ensurePromptSet } = usePromptSet();
  const client = useQueryClient();
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const stage = useMutation({
    mutationFn: async () => {
      const set = await ensurePromptSet();
      const result = await promptsApi.generate(
        set.id,
        {
          agent_revision_id: revisionId,
        },
        { workspaceId },
      );
      await client.invalidateQueries({ queryKey: queryKeys.prompts.all });
      if (!result.candidates.length)
        throw new Error(
          'No new questions passed admission. Refine the portfolio or review suggestions already in Prompts.',
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
