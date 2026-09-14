'use client';

import { useNavigate, useSearchParams } from 'react-router-dom';
import { Suspense, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';

import { PromptLibrary } from './prompt-library';
import { YourPrompts } from './your-prompts';

function PromptsRouteSurface() {
  const router = useNavigate();
  const modeParam = useSearchParams()[0].get('mode');
  // Local override for the in-page toggle buttons; null = follow the URL.
  const [override, setOverride] = useState<boolean | null>(null);
  const managing = override ?? modeParam === 'manage';

  // Replace through the router so its search-parameter subscription updates before the view renders.
  const exitManage = () => {
    setOverride(null);
    if (modeParam === 'manage') router('/prompts', { replace: true });
  };

  if (managing) {
    return (
      <div className="grid gap-[var(--workspace-gap)]">
        <PageHeader />
        <PromptLibrary onDoneManaging={exitManage} />
      </div>
    );
  }

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <YourPrompts />
    </div>
  );
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
