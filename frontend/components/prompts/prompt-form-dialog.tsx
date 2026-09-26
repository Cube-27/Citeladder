'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Prompt, Topic } from '@/lib/api/types';
import {
  emptyPromptForm,
  promptFormSchema,
  promptToFormValues,
  type PromptFormValues,
} from '@/lib/prompts/forms';

/**
 * Add / edit prompt dialog (F7). react-hook-form + zod; the same form serves
 * create (no `prompt`) and edit (prefilled from `prompt`). It asks only for the
 * prompt and its topic, and hands the validated values to `onSubmit`, whose
 * owner maps them to a create or an update payload.
 */
/** Saving wins over both; otherwise the verb follows which dialog this is. */
function submitLabel(saving: boolean | undefined, editing: boolean): string {
  if (saving) return 'Saving…';
  return editing ? 'Save changes' : 'Add prompt';
}

export function PromptFormDialog({
  open,
  onOpenChange,
  prompt,
  topics,
  defaultTopicId,
  onSubmit,
  isSaving,
  error,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt?: Prompt;
  topics: readonly Topic[];
  /** The topic a new prompt starts under: the one the reader is viewing. */
  defaultTopicId: string | null;
  onSubmit: (values: PromptFormValues) => Promise<void> | void;
  isSaving?: boolean;
  error?: string;
}>) {
  const isEdit = Boolean(prompt);
  // Stable across renders: `values` re-syncs the form whenever it changes.
  const initialValues = useMemo(
    () => (prompt ? promptToFormValues(prompt) : emptyPromptForm(defaultTopicId)),
    [prompt, defaultTopicId],
  );
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PromptFormValues>({
    resolver: zodResolver(promptFormSchema),
    values: initialValues,
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) reset(initialValues);
    onOpenChange(next);
  };

  const topicOptions = [
    { value: '', label: 'No topic' },
    ...topics.map((topic) => ({ value: topic.id, label: topic.name })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={isEdit ? 'Edit prompt' : 'Add prompt'}
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={isSaving}>
            {submitLabel(isSaving, isEdit)}
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Field label="Topic">
          {(props) => (
            <Controller
              control={control}
              name="topicId"
              render={({ field }) => (
                <Select
                  {...props}
                  ariaLabel="Topic"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={topicOptions}
                />
              )}
            />
          )}
        </Field>

        <Field label="Prompt" required error={errors.text?.message}>
          {(props) => (
            <Textarea
              {...props}
              {...register('text')}
              placeholder="What are the best running shoes for flat feet?"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
