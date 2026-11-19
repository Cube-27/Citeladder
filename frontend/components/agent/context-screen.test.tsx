import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, type RequestHandler } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { queryKeys } from '@/lib/api/query-keys';
import type { BrandProfile } from '@citeladder/contracts';
import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders, testProjectSelection } from '@/test/render';
import { ActiveProjectScopeProvider } from '@/lib/project/active-project-scope';
import { ProjectSelectionProvider } from '@/lib/project/project-scope';

import { ContextScreen } from './context-screen';

const project = makeProject();
const instructionsEndpoint = `/api/v1/projects/${project.id}/agent/instructions`;
const profileEndpoint = `/api/v1/projects/${project.id}/brand-profile`;
const limits = { statement_max_chars: 300, facts_import_max_rows: 150 };
const saved = (text: string) => ({ text, revision: 1, created_at: '2026-09-26T10:00:00Z' });
/** The instructions read as the harness's active workspace caches it. */
const instructionsKey = queryKeys.agent.instructions({
  workspaceId: testProjectSelection().activeWorkspaceId,
  projectId: project.id,
});
const none = {
  description: null,
  positioning: null,
  products_services: null,
  target_audience: null,
};
const emptyProfile: BrandProfile = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: '33333333-3333-4333-8333-333333333333',
  project_id: project.id,
  brand_id: '44444444-4444-4444-8444-444444444444',
  description: '',
  positioning: '',
  products_services: [],
  target_audience: '',
  business_context: {},
  sources: none,
  source_artifact_ids: none,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  window.history.replaceState(null, '', '/');
});
afterAll(() => mswServer.close());

function ContextScope({ activeProject }: { activeProject: ReturnType<typeof makeProject> }) {
  return (
    <ProjectSelectionProvider
      value={testProjectSelection({
        activeProject,
        activeProjectId: activeProject.id,
        status: 'ready',
      })}
    >
      <ActiveProjectScopeProvider project={activeProject}>
        <ContextScreen />
      </ActiveProjectScopeProvider>
    </ProjectSelectionProvider>
  );
}

/**
 * A project's Context reads: its profile, saved instructions, no suggestions,
 * and outside the fact-checking pilot unless a test says otherwise.
 */
function renderContext({
  profile = emptyProfile,
  activeProject = project,
  tab,
  handlers = [],
}: {
  profile?: BrandProfile;
  activeProject?: ReturnType<typeof makeProject>;
  tab?: string;
  /** Reads that replace the defaults. */
  handlers?: RequestHandler[];
} = {}) {
  mswServer.use(
    http.get(instructionsEndpoint, () => HttpResponse.json(saved('Original'))),
    http.get('/api/v1/projects/:id/brand-profile', () => HttpResponse.json(profile)),
    http.get('/api/v1/projects/:id/brand-facts', () =>
      HttpResponse.json({ enabled: false, facts: [], limits }),
    ),
  );
  mswServer.use(...handlers);
  if (tab) window.history.replaceState(null, '', `/agent/context?tab=${tab}`);
  return renderWithProviders(<ContextScope activeProject={activeProject} />);
}

/** Records the body of the next profile save and answers with `reply`. */
function captureProfileSave(reply: (body: unknown) => Response) {
  const capture: { body?: unknown } = {};
  mswServer.use(
    http.put(profileEndpoint, async ({ request }) => {
      capture.body = await request.json();
      return reply(capture.body);
    }),
  );
  return capture;
}

describe('Context layout', () => {
  it('puts every subject, Agent instructions included, on one tab row', async () => {
    renderContext();
    const tabs = await screen.findByRole('tablist', { name: 'Context sections' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Company', 'Audience', 'Business map', 'Competitors', 'Instructions']);
    // The instructions are a tab of their own, not a section under every tab.
    expect(screen.queryByRole('textbox', { name: 'Agent instructions' })).not.toBeInTheDocument();
  });

  it('opens the tab named in the address and records the tab it switches to', async () => {
    const user = userEvent.setup({ delay: null });
    renderContext({ tab: 'instructions' });
    expect(await screen.findByRole('textbox', { name: 'Agent instructions' })).toHaveValue(
      'Original',
    );
    await user.click(screen.getByRole('tab', { name: 'Competitors' }));
    expect(window.location.search).toBe('?tab=competitors');
  });

  it('offers the save that belongs to the active tab, and none on a read-only tab', async () => {
    const user = userEvent.setup({ delay: null });
    mswServer.use(
      http.get(`/api/v1/projects/${project.id}/business-map`, () =>
        HttpResponse.json({ available_offerings: [], offerings: [] }),
      ),
    );
    renderContext();
    // A blank profile says what belongs here and offers no save until a change.
    const idle = await screen.findByRole('button', { name: 'Save brand knowledge' });
    expect(idle).toHaveAttribute('aria-disabled', 'true');
    expect(idle).toHaveAccessibleDescription('No changes to save');
    expect(screen.getByText(/^No company facts yet/)).toBeVisible();
    await user.type(screen.getByLabelText('Description'), 'Coffee');
    const save = screen.getByRole('button', { name: 'Save brand knowledge' });
    expect(save).toBeEnabled();
    expect(save).not.toHaveAttribute('aria-disabled');
    expect(save).not.toHaveAccessibleDescription('No changes to save');
    expect(screen.queryByText(/^No company facts yet/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Business map' }));
    expect(screen.queryByRole('button', { name: /^save/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Instructions' }));
    const idleInstructions = await screen.findByRole('button', { name: 'Save instructions' });
    expect(idleInstructions).toHaveAttribute('aria-disabled', 'true');
    expect(idleInstructions).toHaveAccessibleDescription('No changes to save');
  });

  it('shows the Brand facts tab with its error when the pilot gate cannot be read', async () => {
    const user = userEvent.setup({ delay: null });
    renderContext({
      handlers: [
        http.get('/api/v1/projects/:id/brand-facts', () =>
          HttpResponse.json(
            { error: { message: 'The fact-checking pilot is unavailable.' } },
            { status: 404 },
          ),
        ),
      ],
    });
    await user.click(await screen.findByRole('tab', { name: 'Brand facts' }));
    expect(await screen.findByText('The fact-checking pilot is unavailable.')).toBeVisible();
  });

  it('shows the fixed tabs while the pilot gate is read and adds Brand facts at the end', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderContext({
      handlers: [
        http.get('/api/v1/projects/:id/brand-facts', async () => {
          await gate;
          return HttpResponse.json({ enabled: true, facts: [], limits });
        }),
      ],
    });
    const tabs = await screen.findByRole('tablist', { name: 'Context sections' });
    const labels = () =>
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent);
    expect(labels()).toEqual([
      'Company',
      'Audience',
      'Business map',
      'Competitors',
      'Instructions',
    ]);
    // The fixed tabs are usable before the gate answers.
    expect(await screen.findByLabelText('Description')).toBeVisible();
    release();
    expect(await within(tabs).findByRole('tab', { name: 'Brand facts' })).toBeVisible();
    expect(labels()).toEqual([
      'Company',
      'Audience',
      'Business map',
      'Competitors',
      'Instructions',
      'Brand facts',
    ]);
  });

  it('holds a link to Brand facts on its loading state until the pilot gate answers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderContext({
      tab: 'brand-facts',
      handlers: [
        http.get('/api/v1/projects/:id/brand-facts', async () => {
          await gate;
          return HttpResponse.json({ enabled: true, facts: [], limits });
        }),
      ],
    });
    expect(await screen.findByRole('status', { name: 'Loading brand facts…' })).toBeVisible();
    // The link is not answered with the Company tab while the gate is read.
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
    release();
    expect(await screen.findByRole('tab', { name: 'Brand facts' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('keeps pilot Brand facts on their own tab', async () => {
    const user = userEvent.setup({ delay: null });
    renderContext({
      handlers: [
        http.get('/api/v1/projects/:id/brand-facts', () =>
          HttpResponse.json({
            enabled: true,
            facts: [
              {
                id: '55555555-5555-4555-8555-555555555556',
                topic: 'pricing',
                statement: 'Pro costs $59 per month.',
                source_url: null,
                status: 'confirmed',
                revision: 1,
                updated_at: '2026-11-01T00:00:00Z',
              },
            ],
            limits,
          }),
        ),
      ],
    });
    const facts = await screen.findByRole('tab', { name: 'Brand facts' });
    expect(screen.queryByText('Pro costs $59 per month.')).not.toBeInTheDocument();
    await user.click(facts);
    expect(screen.getByText('Pro costs $59 per month.')).toBeVisible();
  });
});

describe('Company facts', () => {
  it('saves direct edits, keeping drafts across tabs and a typed but unadded offering', async () => {
    const user = userEvent.setup({ delay: null });
    const save = captureProfileSave(() =>
      HttpResponse.json({ ...emptyProfile, description: 'A value-focused family retailer.' }),
    );
    renderContext();
    await user.type(
      await screen.findByLabelText('Description'),
      'A value-focused family retailer.',
    );
    await user.click(screen.getByRole('tab', { name: 'Audience' }));
    await user.type(screen.getByLabelText('Add to Products and services'), 'Clothing');
    await user.click(screen.getByRole('tab', { name: 'Company' }));
    expect(screen.getByLabelText('Description')).toHaveValue('A value-focused family retailer.');
    await user.click(screen.getByRole('button', { name: 'Save brand knowledge' }));

    expect(await screen.findByText(/brand knowledge saved/i)).toBeInTheDocument();
    expect(save.body).toEqual({
      description: 'A value-focused family retailer.',
      products_services: ['Clothing'],
    });
  });

  it('keeps an offering containing a comma as one chip through a save', async () => {
    const user = userEvent.setup({ delay: null });
    const bays = 'Commercial simulator bays for golf courses, and community centers';
    const save = captureProfileSave(() =>
      HttpResponse.json({
        ...emptyProfile,
        products_services: [bays, 'Golf nets, cages and mats'],
      }),
    );
    renderContext({ profile: { ...emptyProfile, products_services: [bays] }, tab: 'audience' });
    const field = await screen.findByLabelText('Add to Products and services');
    await user.type(field, 'Golf nets, cages and mats{Enter}');
    // A duplicate, in any case, cannot be added twice.
    await user.type(field, 'golf NETS, cages and mats{Enter}');
    expect(
      within(screen.getByRole('list', { name: 'Products and services' })).getAllByRole('listitem'),
    ).toHaveLength(2);
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Save brand knowledge' }));

    expect(await screen.findByText(/brand knowledge saved/i)).toBeInTheDocument();
    expect(save.body).toEqual({ products_services: [bays, 'Golf nets, cages and mats'] });
    const list = screen.getByRole('list', { name: 'Products and services' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([bays, 'Golf nets, cages and mats']);
  });

  it('removes an offering chip from the saved list', async () => {
    const user = userEvent.setup({ delay: null });
    const save = captureProfileSave(() =>
      HttpResponse.json({ ...emptyProfile, products_services: ['Golf mats'] }),
    );
    renderContext({
      profile: { ...emptyProfile, products_services: ['Golf nets', 'Golf mats'] },
      tab: 'audience',
    });
    await user.click(await screen.findByRole('button', { name: 'Remove Golf nets' }));
    await user.click(screen.getByRole('button', { name: 'Save brand knowledge' }));
    await waitFor(() => expect(save.body).toEqual({ products_services: ['Golf mats'] }));
  });

  it('sends only the category, buyer and market a reader changed', async () => {
    const user = userEvent.setup({ delay: null });
    const save = captureProfileSave(() => HttpResponse.json(emptyProfile));
    renderContext({
      profile: {
        ...emptyProfile,
        business_context: { category: 'feed software', buyer_type: 'b2b' },
      },
    });
    const category = await screen.findByLabelText(/what you sell/i);
    expect(category).toHaveValue('feed software');
    expect(screen.getByLabelText('Who buys it')).toHaveTextContent('Businesses');
    await user.clear(category);
    await user.type(category, 'product feed management platform');
    await user.click(screen.getByLabelText('Where they buy it'));
    await user.click(screen.getByRole('option', { name: 'Worldwide' }));
    await user.click(screen.getByRole('button', { name: 'Save brand knowledge' }));
    // Untouched facets and fields are not resubmitted, so they are not marked reviewed.
    await waitFor(() =>
      expect(save.body).toEqual({
        category: 'product feed management platform',
        market_scope: 'global',
      }),
    );
  });

  it('sends a cleared category so the save fails instead of silently reverting', async () => {
    const user = userEvent.setup({ delay: null });
    const save = captureProfileSave(() =>
      HttpResponse.json({ error: { message: 'category is required' } }, { status: 422 }),
    );
    renderContext({
      profile: { ...emptyProfile, business_context: { category: 'feed software' } },
    });
    await user.clear(await screen.findByLabelText(/what you sell/i));
    await user.click(screen.getByRole('button', { name: 'Save brand knowledge' }));

    expect(await screen.findByText('category is required')).toBeVisible();
    expect(save.body).toEqual({ category: '' });
    expect(screen.getByLabelText(/what you sell/i)).toHaveValue('');
  });

  it('locks profile fields while a save is pending', async () => {
    const user = userEvent.setup({ delay: null });
    let finishSave: (() => void) | undefined;
    mswServer.use(
      http.put(profileEndpoint, async () => {
        await new Promise<void>((resolve) => {
          finishSave = resolve;
        });
        return HttpResponse.json({ ...emptyProfile, description: 'Submitted description.' });
      }),
    );
    renderContext();
    const description = await screen.findByLabelText('Description');
    await user.type(description, 'Submitted description.');
    await user.click(screen.getByRole('button', { name: 'Save brand knowledge' }));

    await waitFor(() => expect(description).toBeDisabled());
    expect(screen.getByLabelText('Positioning')).toBeDisabled();
    finishSave?.();
    expect(await screen.findByText(/brand knowledge saved/i)).toBeInTheDocument();
    expect(description).toHaveValue('Submitted description.');
  });
});

describe('Competitors', () => {
  it('lists tracked competitors one row each and opens their editor', async () => {
    const user = userEvent.setup({ delay: null });
    const withCompetitors = makeProject({
      competitors: [
        {
          id: '88888888-8888-4888-8888-888888888881',
          name: 'Northstar',
          aliases: [],
          domains: [],
          logo_url: 'https://assets.test/northstar.png',
        },
        {
          id: '88888888-8888-4888-8888-888888888882',
          name: 'Contoso',
          aliases: [],
          domains: ['contoso.test'],
          logo_url: null,
        },
      ],
    });
    renderContext({ activeProject: withCompetitors, tab: 'competitors' });

    const tracked = await screen.findByRole('group', { name: 'Tracked competitors' });
    const rows = [...tracked.querySelectorAll('[data-setting-row]')];
    // Contoso has no cached logo, so its mark falls back to its first letter;
    // each row ends in the competitor's domains.
    expect(rows.map((row) => row.textContent)).toEqual([
      'Northstar—Not set',
      'CContosocontoso.test',
    ]);
    expect(rows[0]?.querySelector('img')).toHaveAttribute(
      'src',
      'https://assets.test/northstar.png',
    );

    await user.click(screen.getByRole('button', { name: 'Edit competitors' }));
    expect(await screen.findByRole('dialog', { name: 'Edit Acme' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove Northstar' })).toBeEnabled();
  });
});

describe('Business map', () => {
  it('shows the map read-only, offerings as one table, suggestions as a draft, linked to the Prompt Builder', async () => {
    const offering = 'Golf practice net';
    mswServer.use(
      http.get(`/api/v1/projects/${project.id}/business-map`, () =>
        HttpResponse.json({
          available_offerings: [offering],
          offerings: [
            {
              offering,
              attributes: [],
              situations: [
                {
                  value: 'Small garden',
                  origin: 'model',
                  review_state: 'suggested',
                  reviewed_by: null,
                  reviewed_at: null,
                  source: {},
                },
              ],
              audiences: [],
              exclusions: [],
            },
          ],
        }),
      ),
    );
    renderContext({
      profile: {
        ...emptyProfile,
        products_services: [offering],
        business_context: {
          buyer_roles: ['Club coach', 'Parent'],
          business_model: 'd2c_product',
          // Discovery inferred the roles; a person has saved the business model.
          field_sources: { buyer_roles: 'inferred', business_model: 'reviewed' },
        },
      },
      tab: 'map',
    });

    const details = await screen.findByLabelText('Business details');
    const [roles] = within(details).getAllByRole('list');
    if (!roles) throw new Error('Buyer roles render as a list');
    expect(
      within(roles)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Club coachSuggested', 'ParentSuggested']);
    expect(details).toHaveTextContent('Business modelProducts sold direct');
    // Discovery's roles are marked Suggested, and the section says what that means once.
    const map = screen.getByRole('region', { name: 'Business map' });
    expect(map).toHaveTextContent('Entries marked Suggested came from discovery');
    // Every offering is one row of one table; a wholly suggested list says so once.
    const offerings = screen.getByRole('region', { name: 'Offerings' });
    expect(offerings).toHaveTextContent('1 offering. Who buys each one');
    expect(offerings).toHaveTextContent('Entries marked suggested came from discovery');
    const [, row] = within(within(offerings).getByRole('table')).getAllByRole('row');
    if (!row) throw new Error('The offering renders as a row');
    expect(
      within(row)
        .getAllByRole('cell')
        .slice(1)
        .map((cell) => cell.textContent),
    ).toEqual(['—Not set', 'Suggested: Small garden', '—Not set']);
    expect(within(row).getByRole('link', { name: offering })).toHaveAttribute(
      'href',
      expect.stringContaining('/prompts/build?offering=Golf+practice+net'),
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(map).getByRole('link', { name: 'Edit in Prompt builder' })).toHaveAttribute(
      'href',
      expect.stringContaining('/prompts/build'),
    );
  });

  it('tells an unrecognized saved business model apart from none', async () => {
    mswServer.use(
      http.get(`/api/v1/projects/${project.id}/business-map`, () =>
        HttpResponse.json({ available_offerings: [], offerings: [] }),
      ),
    );
    const view = renderContext({
      profile: { ...emptyProfile, business_context: { business_model: 'franchise' } },
      tab: 'map',
    });
    expect(await screen.findByLabelText('Business details')).toHaveTextContent(
      'Business model—Unknown',
    );
    view.unmount();

    renderContext({ tab: 'map' });
    expect(await screen.findByLabelText('Business details')).toHaveTextContent(
      'Business model—Not set',
    );
    // Nothing suggested: no suggestion note.
    expect(screen.getByRole('region', { name: 'Business map' })).not.toHaveTextContent(
      'Entries marked Suggested',
    );
  });
});

describe('Agent instruction drafts', () => {
  it('follows refreshed instructions until edited, then preserves the local draft', async () => {
    const { queryClient } = renderContext({ tab: 'instructions' });
    const field = await screen.findByRole('textbox', { name: 'Agent instructions' });
    act(() => queryClient.setQueryData(instructionsKey, saved('Refreshed')));
    await waitFor(() => expect(field).toHaveValue('Refreshed'));
    fireEvent.change(field, { target: { value: 'Local draft' } });
    act(() => queryClient.setQueryData(instructionsKey, saved('Remote edit')));
    await waitFor(() => expect(field).toHaveValue('Local draft'));
    fireEvent.change(field, { target: { value: 'Original' } });
    expect(field).toHaveValue('Original');
    expect(screen.getByRole('button', { name: 'Save instructions' })).toBeEnabled();
  });

  it('keeps a draft across tab switches', async () => {
    const user = userEvent.setup({ delay: null });
    renderContext({ tab: 'instructions' });
    fireEvent.change(await screen.findByRole('textbox', { name: 'Agent instructions' }), {
      target: { value: 'Plain, warm tone.' },
    });
    await user.click(screen.getByRole('tab', { name: 'Competitors' }));
    await user.click(screen.getByRole('tab', { name: 'Instructions' }));
    expect(screen.getByRole('textbox', { name: 'Agent instructions' })).toHaveValue(
      'Plain, warm tone.',
    );
  });

  it.each(['Later typing', 'Original'])(
    'preserves %s entered while a save is pending',
    async (later) => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { queryClient } = renderContext({ tab: 'instructions' });
      mswServer.use(
        http.put(instructionsEndpoint, async () => {
          await pending;
          return HttpResponse.json(saved('Submitted'));
        }),
      );
      const field = await screen.findByRole('textbox', { name: 'Agent instructions' });
      fireEvent.change(field, { target: { value: 'Submitted' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save instructions' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save instructions' })).toBeDisabled(),
      );
      fireEvent.change(field, { target: { value: later } });
      release();
      await waitFor(() =>
        expect(queryClient.getQueryData(instructionsKey)).toEqual(saved('Submitted')),
      );
      expect(field).toHaveValue(later);
      expect(screen.getByRole('button', { name: 'Save instructions' })).toBeEnabled();
    },
  );

  it('is read-only, with no save, for a member who cannot run the agent', async () => {
    mswServer.use(
      http.get(instructionsEndpoint, () => HttpResponse.json(saved('Original'))),
      http.get('/api/v1/projects/:id/brand-profile', () => HttpResponse.json(emptyProfile)),
      http.get('/api/v1/projects/:id/competitor-suggestions', () => HttpResponse.json([])),
      http.get('/api/v1/projects/:id/brand-facts', () =>
        HttpResponse.json({ enabled: false, facts: [], limits }),
      ),
    );
    window.history.replaceState(null, '', '/agent/context?tab=instructions');
    const { activeWorkspace } = testProjectSelection();
    if (!activeWorkspace) throw new Error('The harness resolves a workspace');
    const viewer = { ...activeWorkspace, role: 'viewer' as const, capabilities: ['read'] };
    renderWithProviders(
      <ProjectSelectionProvider
        value={testProjectSelection({
          activeProject: project,
          activeProjectId: project.id,
          status: 'ready',
          workspaces: [viewer],
          activeWorkspace: viewer,
        })}
      >
        <ActiveProjectScopeProvider project={project}>
          <ContextScreen />
        </ActiveProjectScopeProvider>
      </ProjectSelectionProvider>,
    );
    expect(await screen.findByRole('textbox', { name: 'Agent instructions' })).toHaveAttribute(
      'readonly',
    );
    expect(screen.queryByRole('button', { name: /^save/i })).not.toBeInTheDocument();
  });
});
