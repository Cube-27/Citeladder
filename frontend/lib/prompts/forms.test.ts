import { describe, expect, it } from 'vite-plus/test';

import type { Prompt } from '@/lib/api/types';
import {
  emptyPromptForm,
  formValuesToPromptInput,
  formValuesToPromptUpdate,
  promptFormSchema,
  promptToFormValues,
} from './forms';

const TOPIC_ID = '33333333-3333-4333-8333-333333333333';

describe('promptFormSchema', () => {
  it('requires non-empty text', () => {
    expect(promptFormSchema.safeParse(emptyPromptForm()).success).toBe(false);
    expect(promptFormSchema.safeParse({ ...emptyPromptForm(), text: 'Hello' }).success).toBe(true);
  });
});

describe('form mapping', () => {
  it('prefills from an existing prompt', () => {
    const prompt: Prompt = {
      id: '11111111-1111-4111-8111-111111111111',
      prompt_set_id: '22222222-2222-4222-8222-222222222222',
      topic_id: TOPIC_ID,
      text: 'Best shoes?',
      theme: 'Comfort',
      intent: 'purchase',
      buyer_stage: '',
      prompt_intent: '',
      cohort: 'comparison',
      branded: true,
      enabled: false,
      origin: 'manual',
      status: 'active',
    };
    expect(promptToFormValues(prompt)).toEqual({ text: 'Best shoes?', topicId: TOPIC_ID });
  });

  it('creates with only text and topic, leaving internal fields to their defaults', () => {
    expect(formValuesToPromptInput({ text: '  Best shoes?  ', topicId: TOPIC_ID })).toEqual({
      text: 'Best shoes?',
      topic_id: TOPIC_ID,
    });
    expect(formValuesToPromptInput({ text: 'Best shoes?', topicId: '' })).toEqual({
      text: 'Best shoes?',
    });
  });

  it('updates only what the form edits and detaches an emptied topic', () => {
    expect(formValuesToPromptUpdate({ text: ' Best shoes? ', topicId: '' })).toEqual({
      text: 'Best shoes?',
      topic_id: null,
    });
  });
});
