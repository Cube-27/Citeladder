'use client';

import { useState } from 'react';

import type { PromptGenerateInput } from '@/lib/api/prompts';
import type { PromptGenerateResponse, Topic } from '@/lib/api/types';

import { GeneratePromptsDialogView } from './generate-prompts-dialog-view';

const MAX_GENERATION_COUNT = 100;

export function GeneratePromptsDialog({
  open,
  onOpenChange,
  topics,
  defaultTopicId,
  onGenerate,
  isGenerating,
  error,
  result,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: Topic[];
  defaultTopicId?: string | null;
  onGenerate: (input: PromptGenerateInput) => Promise<void> | void;
  isGenerating?: boolean;
  error?: unknown;
  result?: PromptGenerateResponse | null;
}>) {
  const [count, setCount] = useState('10');
  const [topicId, setTopicId] = useState(defaultTopicId ?? '');
  const [previousOpen, setPreviousOpen] = useState(open);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) setTopicId(defaultTopicId ?? '');
  }
  const parsedCount = Number(count);
  const countValid =
    Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= MAX_GENERATION_COUNT;
  return (
    <GeneratePromptsDialogView
      open={open}
      onOpenChange={onOpenChange}
      topics={topics}
      count={count}
      topicId={topicId}
      setCount={setCount}
      setTopicId={setTopicId}
      countValid={countValid}
      onSubmit={() => {
        if (countValid) void onGenerate({ count: parsedCount, topic_id: topicId || undefined });
      }}
      isGenerating={isGenerating}
      error={error}
      result={result}
      maxCount={MAX_GENERATION_COUNT}
    />
  );
}
