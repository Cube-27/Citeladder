import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';

import { commerceMutations } from '@/lib/api/commerce';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import type { BuyerPromptGenerateRequest } from '@citeladder/contracts/commerce-requests';
import type { BuyerPrompt } from '@citeladder/contracts/commerce-suite';

/**
 * Metered shopping-prompt generation. A retry of the same request after a
 * failure reuses its idempotency key, so prompts the server already generated
 * (and charged for) are replayed instead of generated again; a success retires
 * the key.
 */
export function useGenerateBuyerPrompts(scope: ProjectScope) {
  const mutation = useMutation(commerceMutations.generateBuyerPrompts(scope));
  const pending = useRef<{ request: string; key: string } | null>(null);
  const generate = (
    input: BuyerPromptGenerateRequest,
    onSuccess?: (created: readonly BuyerPrompt[]) => void,
  ) => {
    const request = JSON.stringify(input);
    if (pending.current?.request !== request)
      pending.current = { request, key: crypto.randomUUID() };
    mutation.mutate(
      { input, idempotencyKey: pending.current.key },
      {
        onSuccess: (created) => {
          if (pending.current?.request === request) pending.current = null;
          onSuccess?.(created);
        },
      },
    );
  };
  return { generate, mutation };
}
