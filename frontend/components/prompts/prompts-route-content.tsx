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
  // A one-shot request to open the Generate dialog. It is read once on arrival
  // and removed so a reload or back navigation does not reopen the dialog.
  const [openGenerate] = useState(() => searchParams.get(GENERATE_PROMPTS_PARAM) === '1');
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

  if (managing) return <PromptLibrary onDoneManaging={exitManage} openGenerate={openGenerate} />;

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
