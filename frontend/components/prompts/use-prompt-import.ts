import { useMutation } from '@tanstack/react-query';
import { useState, type ComponentProps } from 'react';

import { promptsMutations } from '@/lib/api/prompts';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import type { ProjectScope } from '@/lib/api/query-keys/scope';

import type { PromptLibraryDialogs } from './prompt-library-dialogs';

/** The CSV import dialog's open state and its import. */
export function usePromptImport(
  scope: ProjectScope,
  ensurePromptSet: Parameters<typeof promptsMutations.import>[1],
) {
  const [importOpen, setImportOpen] = useState(false);
  const importMutation = useMutation(promptsMutations.import(scope, ensurePromptSet));
  const importPrompts: ComponentProps<typeof PromptLibraryDialogs>['importPrompts'] = async (
    rows,
  ) => {
    await importMutation.mutateAsync(rows).then(
      () => setImportOpen(false),
      () => undefined,
    );
  };
  return {
    importOpen,
    setImportOpen,
    importPrompts,
    isImporting: importMutation.isPending,
    importError: importMutation.isError
      ? mutationNoticeForError(importMutation.error, { action: 'import the prompts' })
      : undefined,
  };
}
