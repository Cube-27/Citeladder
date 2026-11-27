import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { actionItem, actionsPage } from '@/test/fixtures/actions';
import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { ToastProvider } from '@/components/ui/toast';

import { ActionsScreen } from './actions-list-screen';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '11111111-1111-4111-8111-111111111111';

const selection = {
  activeProjectId: PROJECT,
  activeProject: makeProject({ id: PROJECT, workspace_id: WORKSPACE }),
  status: 'ready' as const,
};

const id = (n: number) => `33333333-3333-4333-8333-3333333333${String(n).padStart(2, '0')}`;
const fix = (n: number, grouping: string, pages: number | null = n) => ({
  ...actionItem(id(n), `Fix ${n}`, PROJECT),
  target_kind: 'issue_family',
  page_count: pages,
  approach: 'fix_technical',
  goal: 'read_site',
  grouping,
  families: ['site_health'],
  priority_band: 'high',
  priority_score: 100 - n,
});
const prompt = {
  ...actionItem(id(99), 'best organic baby bodysuits', PROJECT),
  target_kind: 'prompt',
  approach: 'create_new',
  goal: 'own_pages',
  grouping: 'prompts',
  families: ['ai_visibility'],
};

type Item = ReturnType<typeof fix> | typeof prompt;

function serve() {
  const state = {
    aeo: [
      fix(1, 'aeo', 0),
      fix(2, 'aeo', null),
      ...Array.from({ length: 10 }, (_, i) => fix(i + 3, 'aeo')),
    ] as Item[],
    accepted: 0,
  };
  const seo = [fix(20, 'seo')];
  const reads: string[] = [];
  const bulks: unknown[] = [];
  const grouping = (name: string, items: Item[]) => ({
    grouping: name,
    count: items.length,
    items: items.slice(0, 10),
    next_cursor: items.length > 10 ? 'c1' : null,
  });
  const counts = () => ({
    open: state.aeo.length + 2,
    in_progress: 3 + state.accepted,
    done: 12,
    dismissed: 8,
  });
  mswServer.use(
    http.get(`/api/v1/projects/${PROJECT}/actions/tree`, ({ request }) => {
      reads.push(new URL(request.url).searchParams.toString());
      return HttpResponse.json({
        group_by: 'goal',
        status_counts: counts(),
        goals: [
          { goal: 'read_site', count: 13 + 3, blocking: true },
          { goal: 'own_pages', count: 1, blocking: false },
          { goal: 'mentions', count: 0, blocking: false },
          { goal: 'wrong_claims', count: 0, blocking: false },
        ],
        groups: [
          {
            key: 'read_site',
            count: state.aeo.length + 1,
            groupings: [grouping('aeo', state.aeo), grouping('seo', seo)],
          },
          { key: 'own_pages', count: 1, groupings: [grouping('prompts', [prompt])] },
        ],
      });
    }),
    http.get(`/api/v1/projects/${PROJECT}/actions`, ({ request }) => {
      reads.push(new URL(request.url).searchParams.toString());
      return HttpResponse.json(actionsPage(state.aeo.slice(10), { status_counts: counts() }));
    }),
    http.post(`/api/v1/projects/${PROJECT}/actions/status`, async ({ request }) => {
      const body = (await request.json()) as { ids?: string[]; filter?: unknown; to: string };
      bulks.push(body);
      if (body.filter) {
        const moved = bulks.length === 1 ? [id(1), id(2)] : [id(3)];
        return HttpResponse.json({
          updated: moved.length,
          moved_ids: moved,
          skipped: 0,
          truncated: bulks.length === 1,
        });
      }
      const moved = state.aeo.filter((item) => body.ids?.includes(item.id)).map(({ id }) => id);
      state.aeo = state.aeo.filter((item) => !moved.includes(item.id));
      state.accepted += moved.length;
      return HttpResponse.json({
        updated: moved.length,
        moved_ids: moved,
        skipped: 0,
        truncated: false,
      });
    }),
  );
  return { reads, bulks };
}

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function renderActions(path = '/actions') {
  window.history.replaceState(null, '', path);
  return renderWithProviders(
    <ToastProvider>
      <Routes>
        <Route path="/actions" element={<ActionsScreen />} />
        <Route path="/actions/:actionId" element={<p>Action detail</p>} />
      </Routes>
    </ToastProvider>,
    { initialEntries: [path], projectSelection: selection },
  );
}

const rowTitles = (grouping: string) =>
  within(screen.getByRole('table', { name: grouping }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getByRole('link').textContent);

describe('Actions', () => {
  it('renders one tree read as status, goal, grouping and ten rows, and Show more appends the rest', async () => {
    const { reads } = serve();
    const user = userEvent.setup();
    renderActions();

    expect(await screen.findByRole('table', { name: '12 actions' })).toBeVisible();
    const levels = (expanded: boolean) =>
      screen
        .getAllByRole('button', { expanded })
        .map((button) => button.getAttribute('aria-label') ?? '')
        .filter((name) => /, \d/.test(name));
    expect(levels(true)).toEqual(['New, 14', 'Let AI read your site, 13, blocking', 'AEO, 12']);
    expect(levels(false)).toEqual([
      'SEO, 1',
      'Improve your own pages, 1',
      'In progress, 3',
      'Done, 12',
      'Declined, 8',
    ]);
    expect(
      within(screen.getByRole('group', { name: 'Goals' }))
        .getAllByRole('button', { name: /^Go to/ })
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Go to Let AI read your site, 16 fixes open, blocking',
      'Go to Improve your own pages, 1 action on your pages',
      'Go to Get mentioned elsewhere, 0 placements to win',
      'Go to Fix wrong claims AI makes about your brand, 0 claims to correct',
    ]);
    expect(rowTitles('12 actions')).toEqual(Array.from({ length: 10 }, (_, i) => `Fix ${i + 1}`));
    const scopes = within(screen.getByRole('table', { name: '12 actions' }))
      .getAllByRole('row')
      .slice(1, 4)
      .map((row) => within(row).getAllByRole('cell')[2]?.textContent);
    expect(scopes).toEqual(['Whole site', 'Not stated', '3 URLs']);

    await user.click(screen.getByRole('button', { name: 'Show 2 more' }));
    await waitFor(() =>
      expect(rowTitles('12 actions')).toEqual(Array.from({ length: 12 }, (_, i) => `Fix ${i + 1}`)),
    );
    expect(screen.queryByRole('button', { name: /^Show \d+ more$/ })).toBeNull();
    expect(reads).toEqual([
      'status=open&group_by=goal',
      'status=open&grouping=aeo&cursor=c1&limit=10',
    ]);
  });

  it('draws one empty state with Create action for a project that never had an action, and the filters once one is set', async () => {
    serve();
    mswServer.use(
      http.get(`/api/v1/projects/${PROJECT}/actions/tree`, () =>
        HttpResponse.json({
          group_by: 'goal',
          status_counts: { open: 0, in_progress: 0, done: 0, dismissed: 0 },
          goals: ['read_site', 'own_pages', 'mentions', 'wrong_claims'].map((goal) => ({
            goal,
            count: 0,
            blocking: false,
          })),
          groups: [],
        }),
      ),
    );
    const empty = renderActions();
    expect(await screen.findByRole('heading', { name: 'No actions yet' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create action' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Status: / })).toBeNull();
    empty.unmount();

    renderActions('/actions?impact=high');
    expect(await screen.findByRole('button', { name: /^Status: / })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'No actions yet' })).toBeNull();
  });

  it('accepts the counted New Actions under the filters, then accepts the rest and undoes from the toast', async () => {
    const { bulks } = serve();
    const user = userEvent.setup();
    renderActions('/actions?impact=high&source=site_health');
    const filter = { status: 'open', priority: 'high', family: 'site_health' };

    await screen.findByRole('table', { name: '12 actions' });
    await user.click(screen.getByRole('button', { name: 'Accept 14 actions' }));
    await screen.findByText('2 actions moved to In progress');
    await user.click(screen.getByRole('button', { name: 'Accept remaining' }));
    const last = (await screen.findByText('1 action moved to In progress')).closest('li');
    if (!last) throw new Error('The second toast has no item');
    expect(within(last).queryByRole('button', { name: 'Accept remaining' })).toBeNull();
    await user.click(within(last).getByRole('button', { name: 'Undo' }));

    await waitFor(() =>
      expect(bulks).toEqual([
        { to: 'in_progress', filter },
        { to: 'in_progress', filter },
        { to: 'open', ids: [id(3)] },
      ]),
    );
  });

  it("moves a ticked row's Accept out of New at once and keeps the server's counts", async () => {
    const { bulks } = serve();
    const user = userEvent.setup();
    renderActions();

    await screen.findByRole('table', { name: '12 actions' });
    await user.click(screen.getByRole('checkbox', { name: 'Select Fix 2' }));
    const bar = screen.getByRole('toolbar', { name: 'Selected actions' });
    expect(within(bar).getByText('1 selected')).toBeVisible();
    await user.click(within(bar).getByRole('button', { name: 'Accept' }));

    const names = () =>
      ['New', 'In progress', 'Let AI read your site', 'AEO'].map((name) =>
        screen.getByRole('button', { name: new RegExp(`^${name}, `) }).getAttribute('aria-label'),
      );
    const settled = ['New, 13', 'In progress, 4', 'Let AI read your site, 12, blocking', 'AEO, 11'];
    expect(names()).toEqual(settled);
    expect(rowTitles('11 actions')).not.toContain('Fix 2');
    expect(screen.queryByRole('toolbar', { name: 'Selected actions' })).toBeNull();
    await waitFor(() => expect(bulks).toEqual([{ to: 'in_progress', ids: [id(2)] }]));
    await waitFor(() => expect(rowTitles('11 actions')).toContain('Fix 11'));
    expect(names()).toEqual(settled);
  });

  it('a ticked grouping covers its ticked rows: counted once and sent by its filter alone', async () => {
    const { bulks } = serve();
    const user = userEvent.setup();
    renderActions();

    await screen.findByRole('table', { name: '12 actions' });
    await user.click(screen.getByRole('checkbox', { name: 'Select Fix 2' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select every action in AEO' }));
    const bar = screen.getByRole('toolbar', { name: 'Selected actions' });
    expect(within(bar).getByText('12 selected')).toBeVisible();
    await user.click(within(bar).getByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(bulks).toEqual([{ to: 'in_progress', filter: { status: 'open', grouping: 'aeo' } }]),
    );
  });
});
