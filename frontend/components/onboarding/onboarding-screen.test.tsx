import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BrandDiscovery } from '@/lib/api/brand-discoveries';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { OnboardingScreen } from './onboarding-screen';

const { replace, setActiveProjectId } = vi.hoisted(() => ({
  replace: vi.fn(),
  setActiveProjectId: vi.fn(),
}));

const DISCOVERY_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const CRAWL_ID = '33333333-3333-4333-8333-333333333333';

let discoveryState: BrandDiscovery;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ setActiveProjectId }),
}));

vi.mock('@/lib/onboarding/use-brand-discovery', () => ({
  useBrandDiscovery: (input: unknown) => ({
    discovery: input ? discoveryState : null,
    isRunning:
      Boolean(input) && (discoveryState.status === 'queued' || discoveryState.status === 'running'),
    error: null,
    retry: vi.fn(),
  }),
}));

function discovery(status: BrandDiscovery['status'], phase: BrandDiscovery['progress']['phase']) {
  return {
    id: DISCOVERY_ID,
    workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    project_id: null,
    status,
    progress: {
      phase,
      completed_steps: status === 'ready' ? 5 : 2,
      total_steps: 5,
      pages_read: 3,
      competitors_found: 1,
      prompts_prepared: 5,
    },
    input_data: { brand_name: 'Acme', website_url: 'https://acme.example' },
    profile: {
      description: 'A commerce platform',
      positioning: 'Reliable product data',
      products_services: ['Product feeds'],
      target_audience: 'Retailers',
      industry: 'Commerce software',
      business_type: 'b2b',
      price_tier: 'premium',
    },
    domains: ['acme.example'],
    competitors: [{ name: 'Globex', aliases: [], domains: ['globex.example'] }],
    topics: ['Product feeds', 'Comparisons'],
    prompt_suggestions: [
      ...Array.from({ length: 4 }, (_, index) => ({
        text: `Which product feed platform supports retail need ${index}?`,
        theme: 'Product feeds',
        intent: 'discovery' as const,
        cohort: 'core' as const,
      })),
      {
        text: 'How does Acme compare with Globex for product feeds?',
        theme: 'Comparisons',
        intent: 'comparison' as const,
        cohort: 'comparison' as const,
      },
    ],
    evidence: [],
    created_at: '2026-08-04T00:00:00Z',
    updated_at: '2026-08-04T00:00:00Z',
  } satisfies BrandDiscovery;
}

function catalogHandler() {
  return http.get('/api/v1/brand-discovery-catalog', () =>
    HttpResponse.json({
      business_types: ['b2b', 'b2c', 'both'],
      price_tiers: ['premium'],
      required_fields: [],
      optional_fields: [],
      capture_methods: [],
      maximum_competitors: 5,
    }),
  );
}

async function enterBrand() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^Brand name/), 'Acme');
  await user.type(screen.getByLabelText(/^Website/), 'acme.example');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return user;
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => mswServer.close());

describe('OnboardingScreen', () => {
  it('renders persisted discovery facts in human language without raw diagnostics', async () => {
    discoveryState = discovery('running', 'finding_competitors');
    mswServer.use(catalogHandler());
    renderWithProviders(<OnboardingScreen />);

    await enterBrand();

    expect(screen.getByText('Opening your website')).toBeInTheDocument();
    expect(screen.getByText('Finding comparable brands')).toBeInTheDocument();
    expect(screen.getByText('3 useful pages read')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /finding_competitors|lease|attempt_count|error_detail|provider/i,
    );
  });

  it('uses one grouped atomic completion and redirects to factual activation progress', async () => {
    discoveryState = discovery('ready', 'preparing_review');
    let completionBody: unknown;
    mswServer.use(
      catalogHandler(),
      http.post(`/api/v1/brand-discoveries/${DISCOVERY_ID}/complete`, async ({ request }) => {
        completionBody = await request.json();
        return HttpResponse.json(
          {
            project_id: PROJECT_ID,
            crawl_id: CRAWL_ID,
            activation_state: 'queued',
            page_limit: 10,
          },
          { status: 201 },
        );
      }),
      http.post(`/api/v1/projects/${PROJECT_ID}/logos/refresh`, () => HttpResponse.json({})),
    );
    renderWithProviders(<OnboardingScreen />);

    const user = await enterBrand();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    const createProject = await screen.findByRole('button', { name: 'Create project' });
    await waitFor(() => expect(createProject).toBeEnabled());
    await user.click(createProject);

    await waitFor(() => expect(completionBody).toBeDefined());
    expect(completionBody).toMatchObject({
      prompt_groups: [
        {
          topic: 'Product feeds',
          prompts: expect.arrayContaining([expect.objectContaining({ cohort: 'core' })]),
        },
        { topic: 'Comparisons', prompts: [expect.objectContaining({ cohort: 'comparison' })] },
      ],
    });
    expect(JSON.stringify(completionBody)).not.toContain('"theme"');
    expect(setActiveProjectId).toHaveBeenCalledWith(PROJECT_ID);
    expect(replace).toHaveBeenCalledWith(
      `/projects?activation=1&project=${PROJECT_ID}&crawl=${CRAWL_ID}&limit=10`,
    );
  });

  it('selects only the first five discovered competitors', async () => {
    discoveryState = {
      ...discovery('ready', 'preparing_review'),
      competitors: Array.from({ length: 6 }, (_, index) => ({
        name: `Peer ${index + 1}`,
        aliases: [],
        domains: [`peer-${index + 1}.example`],
      })),
    };
    mswServer.use(catalogHandler());
    renderWithProviders(<OnboardingScreen />);

    const user = await enterBrand();
    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(await screen.findByText('5 of 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Include Peer 6' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
