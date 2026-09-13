'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';

import { PromptLibrary } from './prompt-library';
import { YourPrompts } from './your-prompts';

function PromptsRouteSurface() {
  const router = useRouter();
  const modeParam = useSearchParams().get('mode');
  // Local override for the in-page toggle buttons; null = follow the URL.
  const [override, setOverride] = useState<boolean | null>(null);
  const managing = override ?? modeParam === 'manage';

  // Route through the owning router so both Next and React Router update the
  // search-parameter subscription before the read view renders.
  const exitManage = () => {
    setOverride(null);
    if (modeParam === 'manage') router.replace('/prompts');
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
  // The route reads useSearchParams (?mode=manage), so retain Next's
  // CSR-bailout boundary while sharing the same surface with Vite.
  return (
    <Suspense>
      <PromptsRouteSurface />
    </Suspense>
  );
}
