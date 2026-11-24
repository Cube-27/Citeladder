import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, expect, it } from 'vite-plus/test';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders, selectionAs } from '@/test/render';

import { PageDrawer } from './page-drawer';
import { CRAWL, URL_ID, pageDetail } from './url-detail.test-support';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

it('opens a page in a drawer titled by the page, with a section rail and its issues on their own pane', async () => {
  mswServer.use(
    http.get(`/api/v1/site-crawls/${CRAWL}/pages/${URL_ID}`, () => HttpResponse.json(pageDetail())),
  );
  const user = userEvent.setup();
  window.history.replaceState(null, '', '/issues');
  renderWithProviders(
    <PageDrawer workspaceId="ws" crawlId={CRAWL} siteUrlId={URL_ID} onClose={() => undefined} />,
    { projectSelection: { ...selectionAs('owner'), activeProject: makeProject() } },
  );
  const drawer = await screen.findByRole('dialog', { name: 'Best&Less Online' });
  expect(within(drawer).queryByText('WebSite schema is missing')).toBeNull();
  expect(
    within(drawer)
      .getAllByRole('tab')
      .map((tab) => tab.textContent?.replace(/ \(\d+\)$/, '')),
  ).toEqual(['Overview', 'Issues', 'Checks', 'Linked from', 'Links out']);
  expect(within(drawer).getByRole('link', { name: 'Open full page' })).toHaveAttribute(
    'href',
    expect.stringContaining(`/site/crawls/${CRAWL}/pages/${URL_ID}`),
  );
  await user.click(await within(drawer).findByRole('tab', { name: /^Issues/ }));
  expect(await within(drawer).findByText('WebSite schema is missing')).toBeInTheDocument();
});
