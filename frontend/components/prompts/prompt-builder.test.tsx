import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState, type ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import type {
  BrandProfile,
  BusinessMap,
  PromptCandidate,
  PromptGenerateResponse,
  SeedQueries,
  Topic,
} from '@citeladder/contracts';
import { makeProject } from '@/test/fixtures/project';
import { makeFormLimits, makeSet, makeSetList } from '@/test/fixtures/prompts';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import type { BuilderStep } from './builder-steps';
import { PromptBuilder } from './prompt-builder';
import { PromptBuilderPage } from './prompt-builder-page';

const projectId = '55555555-5555-4555-8555-555555555555';
const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NETS = '11111111-1111-4111-8111-111111111111';
const QUERY = '22222222-2222-4222-8222-222222222222';
const OFFERING = 'Golf practice net (for gardens, and clubs)';
const noSources = {
  description: null,
  positioning: null,
  products_services: null,
  target_audience: null,
};
const profile: BrandProfile = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspaceId,
  project_id: projectId,
  brand_id: '44444444-4444-4444-8444-444444444444',
  description: '',
  positioning: '',
  products_services: [OFFERING],
  target_audience: '',
  business_context: { buyer_roles: ['Club coach'], market_scope: 'national' },
  sources: noSources,
  source_artifact_ids: noSources,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};
const map: BusinessMap = { offerings: [], available_offerings: [OFFERING] };
const topic: Topic = {
  id: NETS,
  project_id: projectId,
  parent_id: null,
  name: 'Golf nets',
  description: '',
  origin: 'manual',
  active_count: 0,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};
const seeds: SeedQueries = {
  sources: [
    {
      source: 'search_console',
      queries: [{ id: QUERY, text: 'best golf net for a small garden', topic_id: NETS }],
    },
  ],
};
const result: PromptGenerateResponse = {
  candidates: [],
  topics: [],
  dropped_duplicates: 0,
  requested_count: 10,
  candidates_generated: 0,
  quality_gate: 'off',
  quality_rejected: 0,
  admission_drops: {},
  shortfall_reason: null,
};

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

type Sent = { profile?: unknown; confirm?: unknown; seedReads?: number };

function serve(sent: Sent) {
  mswServer.use(
    http.get(`/api/v1/projects/${projectId}/brand-profile`, () => HttpResponse.json(profile)),
    http.get(`/api/v1/projects/${projectId}/business-map`, () => HttpResponse.json(map)),
    http.get(`/api/v1/projects/${projectId}/seed-queries`, () => {
      sent.seedReads = (sent.seedReads ?? 0) + 1;
      return HttpResponse.json(seeds);
    }),
    http.put(`/api/v1/projects/${projectId}/brand-profile`, async ({ request }) => {
      sent.profile = await request.json();
      return HttpResponse.json({
        ...profile,
        business_context: { ...profile.business_context, buyer_roles: ['Club coach', 'Parent'] },
      });
    }),
    http.post(`/api/v1/projects/${projectId}/topics/preview`, () =>
      HttpResponse.json({
        source: 'model',
        topics: [{ name: 'Golf simulator enclosures', offerings: [OFFERING] }],
        overflow: [{ name: 'Hitting mats', offerings: [OFFERING] }],
      }),
    ),
    http.post(`/api/v1/projects/${projectId}/topics/confirm`, async ({ request }) => {
      sent.confirm = await request.json();
      return HttpResponse.json([topic]);
    }),
  );
}

const noReview: ComponentProps<typeof PromptBuilder>['review'] = {
  candidates: [],
  retry: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  isReviewing: false,
  isLoading: false,
  loadError: undefined,
  error: undefined,
  notice: null,
  clearNotice: vi.fn(),
};

function renderBuilder(
  step: BuilderStep,
  { generate = vi.fn(async () => result), review = noReview } = {},
) {
  // The step lives in the address, as on the page.
  window.history.replaceState(null, '', `/prompts/build?step=${step}`);
  renderWithProviders(
    <PromptBuilder
      initialOffering={null}
      projectId={projectId}
      workspaceId={workspaceId}
      topics={[topic]}
      hasCompetitors={false}
      generate={generate}
      isGenerating={false}
      review={review}
      sets={{ loading: false, error: false, retry: vi.fn() }}
      limits={makeFormLimits()}
    />,
  );
  return { generate };
}

describe('PromptBuilder', () => {
  it('prefills the business step and saves only what changed before moving on', async () => {
    const user = userEvent.setup({ delay: null });
    const sent: { profile?: unknown; confirm?: unknown } = {};
    serve(sent);
    renderBuilder('business');

    // Prefilled from saved knowledge; an offering with commas is one chip.
    const offerings = await screen.findByRole('list', { name: 'What you sell' });
    expect(
      within(offerings)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([OFFERING]);
    expect(screen.queryByRole('group', { name: 'Service areas' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Add to Buyer roles' }), 'Parent{Enter}');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(sent.profile).toEqual({ buyer_roles: ['Club coach', 'Parent'] }));
    expect(await screen.findByRole('button', { name: 'Suggest topics' })).toBeVisible();
    // The step is in the address, so a reload or Back keeps it; the done step reopens.
    expect(window.location.search).toBe('?step=topics');
    await user.click(screen.getByRole('button', { name: /About your business/ }));
    expect(window.location.search).toBe('');
    expect(await screen.findByRole('list', { name: 'What you sell' })).toBeVisible();
  });

  it('lists each offering as one row that opens in place, one at a time, by keyboard', async () => {
    const user = userEvent.setup({ delay: null });
    serve({});
    renderBuilder('business');
    await user.type(
      await screen.findByRole('textbox', { name: 'Add to What you sell' }),
      'Hitting mats{Enter}',
    );
    const net = screen.getByRole('button', { name: (name) => name.startsWith(OFFERING) });
    const mats = screen.getByRole('button', { name: /^Hitting mats/ });
    expect(net).toHaveTextContent(`${OFFERING}Not set`);
    expect(screen.queryByRole('group', { name: 'Who buys it' })).not.toBeInTheDocument();

    net.focus();
    await user.keyboard('{Enter}');
    expect(net).toHaveAttribute('aria-expanded', 'true');
    expect(net).toHaveFocus();
    await user.type(screen.getByRole('textbox', { name: 'Add to Who buys it' }), 'Parents{Enter}');
    expect(net).toHaveTextContent('1 buyer · 0 situations · 0 attributes');

    mats.focus();
    await user.keyboard(' ');
    expect(mats).toHaveAttribute('aria-expanded', 'true');
    expect(net).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('textbox', { name: 'Add to Who buys it' })).toHaveLength(1);
  });

  it('confirms reviewed topics as one plan, writing nothing before', async () => {
    const user = userEvent.setup({ delay: null });
    const sent: Sent = {};
    serve(sent);
    renderBuilder('topics');
    await waitFor(() => expect(sent.seedReads).toBe(1));

    // Proposals sit beside the existing topic; nothing is written until confirmed.
    await user.click(await screen.findByRole('button', { name: 'Suggest topics' }));
    expect(
      await screen.findByRole('textbox', { name: 'Topic name: Golf simulator enclosures' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Topic name: Golf nets' })).toBeVisible();
    // The offering links confirm will save are shown on the proposal.
    expect(screen.getByText(`Covers ${OFFERING}`)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '+1 more' }));
    await user.click(screen.getByRole('button', { name: 'Remove Hitting mats' }));
    expect(sent.confirm).toBeUndefined();
    await user.click(screen.getByRole('button', { name: /Confirm topics/ }));
    await waitFor(() =>
      expect(sent.confirm).toEqual({
        create: [{ name: 'Golf simulator enclosures', offerings: [OFFERING] }],
        rename: [],
        delete: [],
      }),
    );
    // The seed queries bound to topics are read again once the plan is applied.
    await waitFor(() => expect(sent.seedReads).toBe(2));
    expect(await screen.findByRole('button', { name: 'Generate' })).toBeVisible();
  });

  it('keeps the step a person moved to while topics were confirming', async () => {
    const user = userEvent.setup({ delay: null });
    serve({});
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    mswServer.use(
      http.post(`/api/v1/projects/${projectId}/topics/confirm`, async () => {
        await held;
        return HttpResponse.json([topic]);
      }),
    );
    renderBuilder('topics');
    await user.click(await screen.findByRole('button', { name: 'Suggest topics' }));
    await screen.findByRole('textbox', { name: 'Topic name: Golf simulator enclosures' });
    await user.click(screen.getByRole('button', { name: /Confirm topics/ }));
    await user.click(screen.getByRole('button', { name: /About your business/ }));
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    expect(window.location.search).toBe('');
  });

  it('generates with every builder field, then lands in review with coverage', async () => {
    const user = userEvent.setup({ delay: null });
    serve({});
    const { generate } = renderBuilder('distribution');

    // Defaults, a persona from step 1 and the connected search source.
    await user.click(await screen.findByRole('checkbox', { name: 'Club coach' }));
    expect(
      await screen.findByRole('checkbox', { name: 'best golf net for a small garden' }),
    ).toBeChecked();
    expect(screen.getByRole('spinbutton', { name: /Competitor alternatives/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(generate).toHaveBeenCalledWith({
      count: 10,
      topic_ids: [],
      distribution: {
        branded_share: 0.2,
        comparison_share: 0,
        intent_mix: { informational: 25, commercial: 50, transactional: 25 },
        personas: ['Club coach'],
      },
      seed_source: 'search_console',
    });

    // Step 4: the run lands in review with its coverage.
    expect(await screen.findByText(/No pending suggestions remain/)).toBeVisible();
    expect(screen.getByText('Coverage by topic')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate more for Golf nets' })).toBeEnabled();
  });

  it('tracks only the selected suggestions from the footer', async () => {
    const user = userEvent.setup({ delay: null });
    serve({});
    const accept = vi.fn();
    const suggestion = (id: string, text: string): PromptCandidate => ({
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
    renderBuilder('review', {
      review: {
        ...noReview,
        accept,
        candidates: [
          suggestion('a', 'best golf net for a small garden'),
          suggestion('b', 'which golf net survives the rain'),
        ],
      },
    });

    const track = screen.getByRole('button', { name: /^Track/ });
    expect(track).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /survives the rain/ }));
    expect(track).toHaveTextContent('Track 1 prompt');
    await user.click(track);
    expect(accept).toHaveBeenCalledWith(['b']);
  });
});

describe('PromptBuilderPage', () => {
  it('keeps a run from an earlier visit pending, and never moves a person who left', async () => {
    const user = userEvent.setup({ delay: null });
    serve({});
    const set = makeSet([]);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let runs = 0;
    mswServer.use(
      http.get('/api/v1/prompt-sets', () => HttpResponse.json(makeSetList([set]))),
      http.get(`/api/v1/prompt-sets/${set.id}/candidates`, () => HttpResponse.json([])),
      http.get(`/api/v1/projects/${projectId}/topics`, () => HttpResponse.json([topic])),
      http.post(`/api/v1/prompt-sets/${set.id}/generate`, async () => {
        runs += 1;
        await held;
        return HttpResponse.json(result);
      }),
    );
    // Each visit lands on Distribution; leaving goes back to Prompts.
    const visit = (onPage: boolean) => {
      window.history.pushState(null, '', onPage ? '/prompts/build?step=distribution' : '/prompts');
      return onPage;
    };
    function Visits() {
      const [onPage, setOnPage] = useState(() => visit(true));
      return (
        <>
          {onPage ? <PromptBuilderPage /> : null}
          <button type="button" onClick={() => setOnPage(visit(!onPage))}>
            {onPage ? 'Leave' : 'Return'}
          </button>
        </>
      );
    }
    const project = makeProject({ id: projectId });
    const { queryClient } = renderWithProviders(<Visits />, {
      projectSelection: {
        projects: [project],
        activeProject: project,
        activeProjectId: project.id,
        status: 'ready',
      },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(runs).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await user.click(screen.getByRole('button', { name: 'Return' }));
    expect(await screen.findByRole('button', { name: /Generating/ })).toBeDisabled();

    // The run finishes after the person left: their address keeps no builder step.
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    release();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(window.location.pathname + window.location.search).toBe('/prompts');
    expect(runs).toBe(1);
  });
});
