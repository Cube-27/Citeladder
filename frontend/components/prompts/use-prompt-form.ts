import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import type { Prompt } from '@citeladder/contracts';
import { promptsMutations } from '@/lib/api/prompts';
import { mutationNoticeForError, type MutationNotice } from '@/lib/api/mutation-notice';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import {
  formValuesToPromptInput,
  formValuesToPromptUpdate,
  type PromptFormValues,
} from '@/lib/prompts/forms';

function mutationFailure(
  create: { isError: boolean; error: unknown },
  update: { isError: boolean; error: unknown },
): MutationNotice | undefined {
  if (create.isError) return mutationNoticeForError(create.error, { action: 'add the prompt' });
  return update.isError
    ? mutationNoticeForError(update.error, { action: 'save the prompt' })
    : undefined;
}

/** The add/edit prompt form: its open state, the prompt being edited and its save. */
export function usePromptForm(
  scope: ProjectScope,
  ensurePromptSet: Parameters<typeof promptsMutations.create>[1],
) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Prompt | undefined>(undefined);
  const closeForm = () => {
    setFormOpen(false);
    setEditing(undefined);
  };
  const createMutation = useMutation(promptsMutations.create(scope, ensurePromptSet));
  const updateMutation = useMutation(promptsMutations.update(scope));

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (prompt: Prompt) => {
    setEditing(prompt);
    setFormOpen(true);
  };
  const submitForm = async (values: PromptFormValues) => {
    const mutation = editing
      ? updateMutation.mutateAsync({
          promptId: editing.id,
          input: formValuesToPromptUpdate(values),
        })
      : createMutation.mutateAsync(formValuesToPromptInput(values));
    await mutation.then(closeForm, () => undefined);
  };
  return {
    formOpen,
    setFormOpen,
    editing,
    setEditing,
    openAdd,
    openEdit,
    submitForm,
    isSaving: createMutation.isPending || updateMutation.isPending,
    formError: mutationFailure(createMutation, updateMutation),
  };
}
