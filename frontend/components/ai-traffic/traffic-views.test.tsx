import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vite-plus/test';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { makeProject } from '@/test/fixtures/project';
import { TabsRoot } from '@/components/ui/tabs';
import { TrafficActivity, TrafficCrawlers } from './traffic-views';

const project = makeProject({
  id: '88888888-8888-4888-8888-888888888888',
  workspace_id: '11111111-1111-4111-8111-111111111111',
});
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProject: project, isLoading: false }),
  useOptionalProjectContext: () => ({ activeProjectId: project.id }),
  useWorkspaceCapability: () => true,
  useActiveWorkspaceId: () => project.workspace_id,
}));
const root = '/api/v1/projects/' + project.id;

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

it.each(['crawlers', 'activity'] as const)('offers crawl setup from empty %s', async (tab) => {
  mswServer.use(
    http.get(root + '/crawl-logs/sources', () =>
      HttpResponse.json({
        availability: 'available',
        gcp_pull: {
          availability: 'available',
          reader_email: 'citeladder-log-reader@example.iam.gserviceaccount.com',
          log_filter: 'resource.type="http_load_balancer"',
          catalog_version: '2',
        },
        items: [],
      }),
    ),
    http.get(root + '/ai-traffic/' + tab, () =>
      HttpResponse.json({ items: [], next_cursor: null }),
    ),
  );
  const user = userEvent.setup();
  const scope = {
    workspaceId: project.workspace_id,
    projectId: project.id,
    filters: { range: '30d' },
  };
  renderWithProviders(
    <TabsRoot value={tab} onValueChange={() => {}}>
      {tab === 'crawlers' ? <TrafficCrawlers {...scope} /> : <TrafficActivity {...scope} />}
    </TabsRoot>,
  );
  // The empty state sits inside the table, under its column headers.
  const table = await screen.findByRole('table');
  expect(await within(table).findByRole('heading', { name: /No matching requests/ })).toBeVisible();
  await user.click(await screen.findByRole('button', { name: 'Connect crawl logs' }));
  expect(
    await within(screen.getByRole('dialog')).findByRole('radiogroup', {
      name: 'Collection method',
    }),
  ).toBeVisible();
});
