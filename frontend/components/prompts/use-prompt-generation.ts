import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';

import type { PromptGenerateRequest } from '@citeladder/contracts/prompt-requests';
import { promptsMutations } from '@/lib/api/prompts';
import type { ProjectScope } from '@/lib/api/query-keys/scope';

/** The Prompt Builder's generation run, keyed so a retry replays a staged run. */
export function usePromptGeneration({
  scope,
  ensurePromptSet,
  onGenerated,
}: Readonly<{
  scope: ProjectScope;
  ensurePromptSet: Parameters<typeof promptsMutations.generate>[1];
  onGenerated: () => void;
}>) {
  // A retry of the same request after a failure reuses its key, so a run the
  // server already staged is replayed instead of drafted (and paid for) again.
  const generateKey = useRef<{ request: string; key: string } | null>(null);
  const generateMutation = useMutation(promptsMutations.generate(scope, ensurePromptSet));
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
    onGenerated();
    return result;
  };
  return { generateMutation, generatePrompts };
}
