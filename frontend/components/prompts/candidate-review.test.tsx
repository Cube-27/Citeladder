import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { PromptCandidate } from '@/lib/api/types';

import { CandidateReview } from './candidate-review';

const candidate = (id: string, text: string): PromptCandidate => ({
  id,
  run_id: 'run',
  prompt_set_id: 'set',
  topic_id: null,
  text,
  intent: '',
  buyer_stage: '',
  prompt_intent: '',
  cohort: 'core',
  created_at: '',
  expires_at: '',
  quality_status: 'off',
  quality_flags: [],
});

const candidates = [
  candidate('a', 'best trail shoes for wet weather'),
  candidate('b', 'which running shoes suit flat feet'),
];

describe('CandidateReview', () => {
  it('associates distinct quality states with selectable suggestions', async () => {
    render(
      <CandidateReview
        candidates={[
          { ...candidates[0], quality_status: 'unavailable' },
          { ...candidates[1], quality_status: 'judged' },
          candidate('c', 'Which shoes suit walking to work?'),
          { ...candidate('d', 'Which shoes suit a first marathon?'), quality_status: 'not_judged' },
        ]}
        topics={[]}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    const choices = screen.getAllByRole('checkbox', { name: /Select “/ });
    const descriptions = choices.map((choice) => {
      expect(choice).toHaveAccessibleDescription();
      expect(choice).toBeEnabled();
      return document.getElementById(choice.getAttribute('aria-describedby')!)?.textContent;
    });
    // Disabled judging and skipped/failed checks must not become the same state.
    expect(new Set(descriptions).size).toBe(4);
    await userEvent.setup().click(choices[2]);
    expect(screen.getByRole('button', { name: /accept selected/i })).toBeEnabled();
  });
  it('accepts only the selected suggestions and rejects after select-all', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(
      <CandidateReview
        candidates={candidates}
        topics={[]}
        onAccept={onAccept}
        onReject={onReject}
      />,
    );

    const accept = screen.getByRole('button', { name: /accept selected/i });
    expect(accept).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /which running shoes/i }));
    expect(screen.getByRole('checkbox', { name: /select all/i })).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
    await user.click(accept);
    expect(onAccept).toHaveBeenCalledWith(['b']);

    // The selection survives the request (a failure can be retried).
    await user.click(screen.getByRole('button', { name: /reject selected/i }));
    expect(onReject).toHaveBeenCalledWith(['b']);
  });

  it('shows quality flags as advisory labels without hiding the suggestion', () => {
    render(
      <CandidateReview
        candidates={[{ ...candidates[0], quality_status: 'judged', quality_flags: ['natural'] }]}
        topics={[]}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText('best trail shoes for wet weather')).toBeInTheDocument();
    expect(screen.getByText('May read unnaturally')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /best trail shoes/i })).toBeEnabled();
  });
});
