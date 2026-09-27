import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { Topic } from '@/lib/api/types';

import { GeneratePromptsDialog } from './generate-prompts-dialog';

const topic = (id: string, name: string, parent_id: string | null = null): Topic => ({
  id,
  project_id: 'project',
  parent_id,
  name,
  description: '',
  origin: 'manual',
  active_count: 0,
  proposed_count: 0,
  created_at: '',
  updated_at: '',
});

const TOPICS = [
  topic('shoes', 'Running shoes'),
  topic('trail', 'Trail', 'shoes'),
  topic('sandals', 'Sandals'),
];

describe('GeneratePromptsDialog', () => {
  it('sends every selected topic, starting from the rail selection', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(
      <GeneratePromptsDialog
        open
        onOpenChange={vi.fn()}
        topics={TOPICS}
        defaultTopicId="shoes"
        onGenerate={onGenerate}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Running shoes' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Trail' }));
    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(onGenerate).toHaveBeenCalledWith({ count: 10, topic_ids: ['shoes', 'trail'] });
  });

  it('covers every topic when none is selected', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(
      <GeneratePromptsDialog open onOpenChange={vi.fn()} topics={TOPICS} onGenerate={onGenerate} />,
    );

    expect(screen.getByText(/suggestions cover every topic/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(onGenerate).toHaveBeenCalledWith({ count: 10, topic_ids: [] });
  });
});
