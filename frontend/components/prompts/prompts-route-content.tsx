'use client';

import { useNavigate, useSearchParams } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';

import { GENERATE_PROMPTS_PARAM } from '@/lib/prompts/routes';

import { PromptLibrary } from './prompt-library';
import { YourPrompts } from './your-prompts';

function PromptsRouteSurface() {
  const router = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  // Local override for the in-page toggle buttons; null = follow the URL.
  const [override, setOverride] = useState<boolean | null>(null);
  const managing = override ?? modeParam === 'manage';
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

  // Replace through the router so its search-parameter subscription updates before the view renders.
  const exitManage = () => {
    setOverride(null);
    if (modeParam === 'manage') router('/prompts', { replace: true });
  };

  if (managing)
    return <PromptLibrary onDoneManaging={exitManage} generateRequest={generateRequest} />;

  return <YourPrompts />;
}

/** Shared /prompts route content, including its URL-backed manage mode. */
export function PromptsRouteContent() {
  // Keep the route surface behind a Suspense boundary while it reads the URL-backed manage mode.
  return (
    <Suspense>
      <PromptsRouteSurface />
    </Suspense>
  );
}
