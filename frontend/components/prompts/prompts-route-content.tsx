'use client';

import { useSearchParams } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';

import { GENERATE_PROMPTS_PARAM } from '@/lib/prompts/routes';

import { PromptLibrary } from './prompt-library';

function PromptsRouteSurface() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Each arrival with `generate=1`, on mount or by a later in-page navigation,
  // is one request to open the Generate dialog. Counting it while rendering
  // records it before the effect below consumes the parameter, so a reload or
  // back navigation does not reopen the dialog.
  const [generateRequest, setGenerateRequest] = useState(0);
  const [countedParams, setCountedParams] = useState<URLSearchParams | null>(null);
  if (searchParams.get(GENERATE_PROMPTS_PARAM) === '1' && countedParams !== searchParams) {
    setCountedParams(searchParams);
    setGenerateRequest((count) => count + 1);
  }
  useEffect(() => {
    if (!searchParams.has(GENERATE_PROMPTS_PARAM)) return;
    const next = new URLSearchParams(searchParams);
    next.delete(GENERATE_PROMPTS_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return <PromptLibrary generateRequest={generateRequest} />;
}

/** Shared /prompts route content: the prompt library, opened directly. */
export function PromptsRouteContent() {
  // Keep the route surface behind a Suspense boundary while it reads the URL.
  return (
    <Suspense>
      <PromptsRouteSurface />
    </Suspense>
  );
}
