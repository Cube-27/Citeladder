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
});

const candidates = [
  candidate('a', 'best trail shoes for wet weather'),
  candidate('b', 'which running shoes suit flat feet'),
];

describe('CandidateReview', () => {
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
});
