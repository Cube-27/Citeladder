import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { PromptCandidate } from '@citeladder/contracts';

import { CandidateReview, useCandidateSelection } from './candidate-review';

/** The review with its selection held, as the builder holds it. */
function Review(props: Readonly<Omit<ComponentProps<typeof CandidateReview>, 'selection'>>) {
  const selection = useCandidateSelection(props.candidates);
  return <CandidateReview {...props} selection={selection} />;
}

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
  grounded: false,
});

const trailShoes = candidate('a', 'best trail shoes for wet weather');
const flatFeet = candidate('b', 'which running shoes suit flat feet');
const candidates = [trailShoes, flatFeet];

describe('CandidateReview', () => {
  it('associates distinct quality states with selectable suggestions', async () => {
    render(
      <Review
        candidates={[
          { ...trailShoes, quality_status: 'unavailable' },
          { ...flatFeet, quality_status: 'judged' },
          candidate('c', 'Which shoes suit walking to work?'),
          { ...candidate('d', 'Which shoes suit a first marathon?'), quality_status: 'not_judged' },
        ]}
        topics={[]}
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
    await userEvent.setup().click(choices[2]!);
    expect(screen.getByRole('button', { name: /reject selected/i })).toBeEnabled();
  });
  it('rejects only the selected suggestions, then every one after select-all', async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    render(<Review candidates={candidates} topics={[]} onReject={onReject} />);

    const reject = screen.getByRole('button', { name: /reject selected/i });
    expect(reject).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /which running shoes/i }));
    const all = screen.getByRole('checkbox', { name: /select all/i });
    expect(all).toHaveAttribute('aria-checked', 'mixed');
    await user.click(reject);
    expect(onReject).toHaveBeenLastCalledWith(['b']);

    // The selection survives the request (a failure can be retried).
    await user.click(all);
    await user.click(reject);
    expect(onReject).toHaveBeenLastCalledWith(['a', 'b']);
  });

  it('shows quality flags as advisory labels without hiding the suggestion', () => {
    render(
      <Review
        candidates={[{ ...trailShoes, quality_status: 'judged', quality_flags: ['natural'] }]}
        topics={[]}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText('best trail shoes for wet weather')).toBeInTheDocument();
    expect(screen.getByText('May read unnaturally')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /best trail shoes/i })).toBeEnabled();
  });

  it('tags only suggestions whose phrasing your search data informed', () => {
    render(
      <TooltipProvider>
        <Review
          candidates={[{ ...trailShoes, grounded: true }, flatFeet]}
          topics={[]}
          onReject={vi.fn()}
        />
      </TooltipProvider>,
    );

    const rows = screen.getAllByRole('row').filter((row) => row.closest('tbody'));
    expect(rows.map((row) => row.textContent?.includes('Informed by your search data'))).toEqual([
      true,
      false,
    ]);
    expect(screen.getAllByRole('button', { name: 'About search data' })).toHaveLength(1);
  });
});
