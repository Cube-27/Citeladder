import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageFrame } from '@/components/templates/page-frame';
import { StateBlock } from '@/components/ui/state-block';
import type { PromptGenerateRequest } from '@citeladder/contracts/prompt-requests';
import type { Topic } from '@citeladder/contracts';
import { promptsMutations } from '@/lib/api/prompts';
import { queryKeys } from '@/lib/api/query-keys';
import { topicsQueries } from '@/lib/api/topics';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { PROMPTS_HREF } from '@/lib/prompts/routes';
import { usePromptCandidates } from '@/lib/prompts/use-prompt-candidates';
import { usePromptSet } from '@/lib/prompts/use-prompt-set';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import { PromptBuilder } from './prompt-builder';

/**
 * `/prompts/build`: the Prompt builder as its own page under Prompts. It owns
 * the generate request and the candidates read; tracking the accepted
 * suggestions returns to Prompts.
 */
export function PromptBuilderPage() {
  const canWrite = useWorkspaceCapability('write');
  return (
    <PageFrame fitted>
      {canWrite ? (
        <BuilderForProject />
      ) : (
        <StateBlock kind="empty" icon={Lock} heading="Your role can't build prompts" />
      )}
    </PageFrame>
  );
}

function BuilderForProject() {
  const { workspaceId, projectId, project } = useProjectScope();
  const scope = { workspaceId, projectId };
  const { promptSet, limits, isLoading, error, ensurePromptSet, retry, retrying } = usePromptSet();
  const topicsQuery = useQuery(topicsQueries.list(scope));
  const topics: Topic[] = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
  const navigate = useNavigate();
  const projectHref = useProjectHref();

  const review = usePromptCandidates({
    projectId,
    promptSet,
    workspaceId,
    onAccepted: () => void navigate(projectHref(PROMPTS_HREF)),
  });

  // A retry of the same request after a failure reuses its key, so a run the
  // server already staged is replayed instead of drafted (and paid for) again.
  const generateKey = useRef<{ request: string; key: string } | null>(null);
  const generateMutation = useMutation(promptsMutations.generate(scope, ensurePromptSet));
  // A run started on an earlier visit is still in flight: no second paid run.
  const isGenerating = useIsMutating({ mutationKey: queryKeys.prompts.generate(scope) }) > 0;
  const generatePrompts = async (input: PromptGenerateRequest) => {
    const request = JSON.stringify(input);
    if (generateKey.current?.request !== request)
      generateKey.current = { request, key: crypto.randomUUID() };
    const result = await generateMutation
      .mutateAsync({ input, idempotencyKey: generateKey.current.key })
      .catch(() => null);
    if (result === null) return null;
    // Only this request's key retires; a different pending request keeps its own.
    if (generateKey.current?.request === request) generateKey.current = null;
    review.clearNotice();
    return result;
  };

  // The forms enforce the server's bounds, so the builder waits for the set list.
  if (!limits) {
    return error ? (
      <StateBlock
        kind="error"
        error={error}
        title="Couldn't load the prompts"
        fallback="Check your connection and try again."
        onRetry={retry}
        pending={retrying}
      />
    ) : (
      <StateBlock kind="loading" label="Loading the Prompt builder" shape={{ kind: 'facts' }} />
    );
  }
  return (
    // A project switch is a new session, so no draft saves against another project.
    <PromptBuilder
      key={projectId}
      projectId={projectId}
      workspaceId={workspaceId}
      topics={topics}
      hasCompetitors={project.competitors.length > 0}
      generate={generatePrompts}
      isGenerating={isGenerating}
      generateError={generateMutation.isError ? generateMutation.error : undefined}
      review={review}
      sets={{ loading: isLoading, error: error !== null, retry }}
      limits={limits}
    />
  );
}
