import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CommerceCandidate } from '@/lib/api/types';

import { CommerceDiscoveryPanel } from './commerce-discovery-panel';

const projectId = '11111111-1111-4111-8111-111111111111';

function discoveryQueries(overrides: Record<string, unknown> = {}) {
  return {
    runsQuery: { data: [], isLoading: false },
    candidatesQuery: { data: [], isLoading: false },
    previewMutation: {
      data: undefined,
      error: null,
      isPending: false,
      mutateAsync: vi.fn(),
    },
    createMutation: {
      error: null,
      isPending: false,
      mutateAsync: vi.fn(),
    },
    decisionMutation: { isPending: false, mutateAsync: vi.fn() },
    setSelectedRunId: vi.fn(),
    ...overrides,
  };
}

describe('CommerceDiscoveryPanel', () => {
  it('does not reuse a preview after the discovery input changes', async () => {
    const user = userEvent.setup();
    const preview = {
      accepted: [{ name: 'Product A', sku: 'A-1' }],
      duplicates: [],
      errors: [],
      truncated: false,
    };
    const previewMutation = {
      data: preview,
      error: null,
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(preview),
    };
    const createMutation = {
      error: null,
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    };
    const queries = discoveryQueries({ previewMutation, createMutation });
    render(<CommerceDiscoveryPanel projectId={projectId} queries={queries as never} />);

    await user.selectOptions(screen.getByLabelText('Input type'), 'json');
    fireEvent.change(screen.getByLabelText('Discovery input'), {
      target: { value: '[{"name":"Product A","sku":"A-1"}]' },
    });
    await user.click(screen.getByRole('button', { name: 'Preview candidates' }));
    expect(screen.getByText(/1 accepted/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Discovery input'), {
      target: { value: '[{"name":"Product B","sku":"B-1"}]' },
    });
    expect(screen.queryByText(/1 accepted/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create discovery run' }));

    expect(createMutation.mutateAsync).toHaveBeenCalledWith({
      input_kind: 'upload',
      rows: [{ name: 'Product B', sku: 'B-1' }],
    });
  });

  it('accepts an explicit match or creates a new product when none is selected', async () => {
    const user = userEvent.setup();
    const candidate: CommerceCandidate = {
      id: '22222222-2222-4222-8222-222222222222',
      run_id: '33333333-3333-4333-8333-333333333333',
      task_id: '44444444-4444-4444-8444-444444444444',
      artifact_id: '55555555-5555-4555-8555-555555555555',
      candidate_kind: 'own',
      competitor_id: null,
      identity: { name: 'Widget' },
      extraction_confidence: 0.95,
      created_at: '2026-08-03T00:00:00Z',
      matches: [
        {
          target_id: '66666666-6666-4666-8666-666666666666',
          target_kind: 'product',
          confidence: 0.9,
          reasons: ['family_variant'],
          review_required: true,
        },
      ],
    };
    const decisionMutation = {
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    };
    const queries = discoveryQueries({
      candidatesQuery: { data: [candidate], isLoading: false },
      decisionMutation,
    });
    render(<CommerceDiscoveryPanel projectId={projectId} queries={queries as never} />);

    const selector = screen.getByLabelText('Match target for Widget');
    await user.selectOptions(selector, '66666666-6666-4666-8666-666666666666');
    await user.click(screen.getByRole('button', { name: 'Accept / review' }));
    expect(decisionMutation.mutateAsync).toHaveBeenLastCalledWith({
      candidateId: candidate.id,
      body: {
        status: 'accepted',
        target_id: '66666666-6666-4666-8666-666666666666',
      },
    });

    await user.selectOptions(selector, '');
    await user.click(screen.getByRole('button', { name: 'Accept / review' }));
    expect(decisionMutation.mutateAsync).toHaveBeenLastCalledWith({
      candidateId: candidate.id,
      body: { status: 'accepted', target_id: null },
    });
  });
});
