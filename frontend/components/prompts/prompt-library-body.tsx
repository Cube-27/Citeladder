import type { ComponentProps, ReactNode } from 'react';

import type { Prompt } from '@citeladder/contracts';
import { QueryState } from '@/components/ui/query-state';

import { PromptEmptyState } from './prompt-empty-state';
import { PromptTable } from './prompt-table';

/**
 * The library's table, or the state that takes its slot. An empty library and
 * a library filtered to nothing read differently: one needs a way to add
 * prompts, the other needs its filter loosened.
 */
export function PromptLibraryBody({
  visible,
  rows,
  add,
  measurements,
  failedEmpty,
  hasPrompts,
  error,
  retry,
  retrying,
}: Readonly<{
  visible: Prompt[];
  rows: ComponentProps<typeof PromptTable>['actions'];
  add: ComponentProps<typeof PromptEmptyState>['add'];
  measurements: ComponentProps<typeof PromptTable>['measurements'];
  failedEmpty: boolean;
  hasPrompts: boolean;
  error: unknown;
  retry: () => void;
  retrying: boolean;
}>) {
  let libraryBody: ReactNode = (
    <PromptTable prompts={visible} actions={rows} measurements={measurements} />
  );
  // A failed read with nothing to show takes the empty state's slot; a failed
  // refresh keeps the prompts already shown and says so above them.
  if (failedEmpty) {
    libraryBody = (
      <QueryState
        kind="error"
        error={error}
        fallback="Could not load prompts. Check your connection and try again."
        onRetry={retry}
        pending={retrying}
      />
    );
  } else if (!hasPrompts) {
    libraryBody = <PromptEmptyState add={add} />;
  }
  return libraryBody;
}
