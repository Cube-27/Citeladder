import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { mswServer } from '@/test/msw-server';
import { PROJECT, crawl, mockRoutes, renderScreen } from './site-health-screen.test-support';

describe('SiteHealthScreen — the one crawl action', () => {
  it('disables Run new crawl and says why once the full crawls for the period are used', async () => {
    const used = { limit: 10, used: 10, remaining: 0, resets_at: '2026-12-20T00:00:00.000Z' };
    mockRoutes();
    mswServer.use(
      http.get('/api/v1/projects/:projectId/crawl-budgets', () =>
        HttpResponse.json({
          full_crawls: used,
          page_crawls: { ...used, limit: 50, used: 0, remaining: 50 },
        }),
      ),
    );

    renderScreen();

    expect(
      await screen.findByText('All 10 full crawls for this period are used. More from 2026-12-20.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run new crawl' })).toBeDisabled();
  });

  it('keeps a crawl that ignored robots.txt ignoring it, and offers to respect it again', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    mockRoutes({
      robots: { handling: 'ignore', decided_by_email: 'owner@example.test', decided_at: null },
    });
    mswServer.use(
      http.post('/api/v1/site-crawls', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          crawl({ status: 'queued', discovery_status: 'pending', analysis_status: 'pending' }),
        );
      }),
    );

    renderScreen();

    const button = await screen.findByRole('button', { name: 'Run new crawl' });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Recrawl' })).toBeNull();
    await user.click(button);
    await waitFor(() => expect(bodies).toEqual([{ project_id: PROJECT }]));

    bodies.length = 0;
    const options = screen.getByRole('button', { name: 'More crawl options' });
    await waitFor(() => expect(options).toBeEnabled());
    await user.click(options);
    await user.click(await screen.findByRole('menuitem', { name: 'Respect robots.txt' }));
    await waitFor(() => expect(bodies).toEqual([{ project_id: PROJECT, robots: 'respect' }]));
  });

  it('ignores robots.txt only after the person confirms they are authorized', async () => {
    const user = userEvent.setup();
    const started: unknown[] = [];
    mockRoutes();
    mswServer.use(
      http.post('/api/v1/site-crawls', async ({ request }) => {
        started.push(await request.json());
        return HttpResponse.json(crawl({ status: 'running', analysis_status: 'pending' }));
      }),
    );

    renderScreen();
    const options = await screen.findByRole('button', { name: 'More crawl options' });
    await waitFor(() => expect(options).toBeEnabled());
    await user.click(options);
    await user.click(await screen.findByRole('menuitem', { name: 'Ignore robots.txt' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ignore robots.txt for this crawl?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(started).toEqual([]);

    await user.click(options);
    await user.click(await screen.findByRole('menuitem', { name: 'Ignore robots.txt' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'I am authorized, run crawl',
      }),
    );
    await waitFor(() => expect(started).toEqual([{ project_id: PROJECT, robots: 'ignore' }]));
  });

  it('retries a failed crawl start with the same request it sent', async () => {
    const user = userEvent.setup();
    const started: unknown[] = [];
    mockRoutes();
    mswServer.use(
      http.post('/api/v1/site-crawls', async ({ request }) => {
        started.push(await request.json());
        return started.length === 1
          ? HttpResponse.json({ detail: 'Unavailable' }, { status: 503 })
          : HttpResponse.json(crawl({ status: 'running', analysis_status: 'pending' }));
      }),
    );

    renderScreen();
    const options = await screen.findByRole('button', { name: 'More crawl options' });
    await waitFor(() => expect(options).toBeEnabled());
    await user.click(options);
    await user.click(await screen.findByRole('menuitem', { name: 'Ignore robots.txt' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'I am authorized, run crawl',
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(started).toEqual([
        { project_id: PROJECT, robots: 'ignore' },
        { project_id: PROJECT, robots: 'ignore' },
      ]),
    );
  });
});
