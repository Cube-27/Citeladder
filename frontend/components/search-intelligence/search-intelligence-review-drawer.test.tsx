import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import type {
  SearchIntelligenceReadiness,
  SearchIntelligenceRun,
} from '@/lib/api/search-intelligence';

import { SearchIntelligenceReviewDrawer } from './search-intelligence-review-drawer';

const RUN_ID = 'a5df36ea-cb35-40f9-a7a9-a50ff7309cf1';
const readiness: SearchIntelligenceReadiness = {
  connected: true,
  connection_id: '72dbc77c-676f-4bf7-8c29-16f163cb09f5',
  owned_targets: [
    {
      identity: 'primary',
      label: 'Example',
      registrable_domain: 'example.com',
      hostname: 'www.example.com',
      origin: 'https://www.example.com',
      source_kind: 'owned',
    },
  ],
  competitors: [],
  preferences: {
    owned_target_id: 'primary',
    competitor_ids: [],
    location_code: 2840,
    language_code: 'en',
    reuse_recent: true,
    depths: {},
  },
  latest_run: null,
  datasets: [],
};
const reviewedRun: SearchIntelligenceRun = {
  id: RUN_ID,
  status: 'reviewed',
  action: 'analysis',
  pricing_version: 'dataforseo-live-2026-09-20',
  estimated_cost_usd: '0.14412000',
  provider_reported_cost_usd: null,
  planned_calls: 2,
  completed_calls: 0,
  planned_rows: 1001,
  received_rows: 0,
  uncertain_calls: 0,
  error_code: '',
  error_detail: '',
  expires_at: '2026-09-20T11:00:00Z',
  confirmed_at: null,
  cancelled_at: null,
  completed_at: null,
  frozen_scope: {},
  call_plan: [
    {
      request_key: 'ranking:1',
      dataset_kind: 'ranking_keywords',
      estimated_cost_usd: '0.132',
    },
    {
      request_key: 'ranking:2',
      dataset_kind: 'ranking_keywords',
      estimated_cost_usd: '0.01212',
    },
  ],
  reused_datasets: [],
  created_at: '2026-09-20T10:00:00Z',
};

describe('SearchIntelligenceReviewDrawer', () => {
  it('requires a positive location and a seed for keyword suggestions', async () => {
    render(
      <SearchIntelligenceReviewDrawer
        open
        action="analysis"
        readiness={{ ...readiness, preferences: { ...readiness.preferences, location_code: null } }}
        onOpenChange={vi.fn()}
        onReview={vi.fn()}
        onConfirm={vi.fn()}
        busy={false}
      />,
    );
    const submit = screen.getByRole('button', { name: 'Review cost' });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole('combobox', { name: 'Market' }));
    await userEvent.click(screen.getByRole('option', { name: 'Australia' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Keyword suggestions' }));
    expect(submit).toBeDisabled();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Keyword suggestion seed' }),
      'analytics',
    );
    expect(submit).toBeEnabled();
  });

  it('reviews backlink-only evidence without a market', async () => {
    const review = vi.fn().mockResolvedValue(reviewedRun);
    render(
      <SearchIntelligenceReviewDrawer
        open
        action="analysis"
        readiness={{ ...readiness, preferences: { ...readiness.preferences, location_code: null } }}
        onOpenChange={vi.fn()}
        onReview={review}
        onConfirm={vi.fn()}
        busy={false}
      />,
    );
    for (const name of ['Keyword footprint', 'Ranked keywords', 'Organic top pages'])
      await userEvent.click(screen.getByRole('checkbox', { name }));
    await userEvent.click(screen.getByRole('button', { name: 'Review cost' }));
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ location_code: null }));
  });

  it('passes suggestion acquisition controls to review', async () => {
    const review = vi.fn().mockResolvedValue(reviewedRun);
    render(
      <SearchIntelligenceReviewDrawer
        open
        action="seed"
        readiness={readiness}
        onOpenChange={vi.fn()}
        onReview={review}
        onConfirm={vi.fn()}
        busy={false}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Ranking acquisition order' }));
    await userEvent.click(screen.getByRole('option', { name: 'Acquire by cpc' }));
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Minimum acquisition search volume' }),
      '10',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Keyword suggestion seed' }),
      'analytics',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review cost' }));
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({
        datasets: [
          expect.objectContaining({ kind: 'keyword_suggestions', order: 'cpc', min_volume: 10 }),
        ],
      }),
    );
  });

  it('shows review and confirmation failures and clears them when retried', async () => {
    const review = vi
      .fn()
      .mockRejectedValueOnce(new Error('Review expired'))
      .mockResolvedValue(reviewedRun);
    const confirm = vi.fn().mockRejectedValueOnce(null).mockResolvedValue(undefined);
    render(
      <SearchIntelligenceReviewDrawer
        open
        action="analysis"
        readiness={readiness}
        onOpenChange={vi.fn()}
        onReview={review}
        onConfirm={confirm}
        busy={false}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Review cost' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Review expired');
    await userEvent.click(screen.getByRole('button', { name: 'Review cost' }));
    const confirmation = await screen.findByRole('button', { name: 'Confirm $0.1442 acquisition' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(confirmation);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Acquisition could not be confirmed.',
    );
    await userEvent.click(confirmation);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('previews the frozen quote before allowing an explicit paid confirmation', async () => {
    const review = vi.fn().mockResolvedValue(reviewedRun);
    const confirm = vi.fn().mockResolvedValue(undefined);
    render(
      <SearchIntelligenceReviewDrawer
        open
        action="analysis"
        readiness={readiness}
        onOpenChange={vi.fn()}
        onReview={review}
        onConfirm={confirm}
        busy={false}
      />,
    );

    expect(screen.getByText(/No provider request is made until you confirm/)).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Review cost' }));
    expect(review).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByText('$0.1442')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'dd' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm $0.1442 acquisition' }));
    expect(confirm).toHaveBeenCalledWith(RUN_ID);
  });
});
