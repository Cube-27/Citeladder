import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { makeProject } from '@/test/fixtures/project';
import { AiTrafficScreen, CrawlSignalPanel } from './ai-traffic-screen';
import { InsightStrip } from './insight-strip';
import { CrawlLogConnections } from './crawl-log-connections';
const project = makeProject({
  id: '88888888-8888-4888-8888-888888888888',
  workspace_id: '11111111-1111-4111-8111-111111111111',
});
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProject: project, isLoading: false }),
  useWorkspaceCapability: () => true,
  useActiveWorkspaceId: () => project.workspace_id,
}));
const root = '/api/v1/projects/' + project.id;
const crawl = {
  unit: 'requests' as const,
  identity_level: 'path' as const,
  connection: 'connected' as const,
  coverage: 'partial' as const,
  reporting_timezone: 'UTC',
  last_processed_at: null,
  requests: null,
  pages: null,
  active_bots: null,
  error_share: null,
  failed_verification_requests: null,
  series: [],
};
const referrals = {
  project_id: project.id,
  window_start: '',
  window_end: '',
  granularity: 'day',
  referral_volume: [],
  referral_share: [],
  sources: [],
  analyzer_version: '1',
  formula_version: '1',
};
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  window.history.replaceState(null, '', '/ai-traffic');
});
afterAll(() => mswServer.close());
describe('AI Traffic state and navigation', () => {
  it('preserves the issued token until the source dialog is closed', async () => {
    let creates = 0;
    mswServer.use(
      http.get(root + '/crawl-logs/sources', () =>
        HttpResponse.json({ ingestion_enabled: true, items: [] }),
      ),
      http.post(root + '/crawl-logs/sources', () => {
        creates += 1;
        return HttpResponse.json({
          id: '99999999-9999-4999-8999-999999999999',
          token: 'clw_test_token',
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CrawlLogConnections />);
    await user.click(screen.getByRole('button', { name: 'Connect crawl logs' }));
    const dialog = await screen.findByRole('dialog', { name: 'Connect crawl logs' });
    const create = within(dialog).getByRole('button', { name: 'Create source' });
    await waitFor(() => expect(create).toBeEnabled());
    await user.click(create);
    await within(dialog).findByRole('button', { name: 'Copy token' });
    await waitFor(() => expect(create).not.toHaveAttribute('aria-busy'));
    expect(create).toBeDisabled();
    await user.click(create);
    expect(creates).toBe(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Connect crawl logs' }));
    expect(screen.getByRole('button', { name: 'Create source' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Copy token' })).not.toBeInTheDocument();
  });
  it('carries the insight project and filters into the Pages destination', async () => {
    mswServer.use(
      http.get(root + '/ai-traffic/insights', () =>
        HttpResponse.json({
          snapshot_id: 'saved',
          window_start: '2026-10-01',
          window_end: '2026-10-04',
          formula_version: '1',
          patterns: [
            {
              pattern: 'key_event_concentration',
              copy: 'Key events co-occurred on these pages.',
              url_hashes: [],
              numbers: { key_events: 10 },
              coverage: { ga4: 'complete' },
            },
          ],
          coverage: { crawl: 'complete', ga4_complete: true, notice: null },
        }),
      ),
    );
    renderWithProviders(
      <InsightStrip projectId={project.id} workspaceId={project.workspace_id} range="90d" />,
    );
    const link = await screen.findByRole('link', { name: 'Inspect pages' });
    const destination = new URL(link.getAttribute('href')!, window.location.origin);
    expect(Object.fromEntries(destination.searchParams)).toEqual({
      project: project.id,
      tab: 'pages',
      range: '90d',
      sort: 'key_events_desc',
      pattern: 'key_event_concentration',
    });
  });
  it('keeps missing, awaiting, incomplete and measured zero distinct', () => {
    const view = renderWithProviders(
      <CrawlSignalPanel data={{ ...crawl, connection: 'not_connected' }} />,
    );
    expect(screen.getByRole('button', { name: 'Connect crawl logs' })).toBeEnabled();
    view.rerender(<CrawlSignalPanel data={{ ...crawl, connection: 'awaiting_data' }} />);
    expect(screen.getByText(/Awaiting the first accepted batch/)).toBeVisible();
    view.rerender(<CrawlSignalPanel data={crawl} />);
    expect(screen.getByText(/No matching requests were observed/)).toBeVisible();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    view.rerender(
      <CrawlSignalPanel
        data={{ ...crawl, coverage: 'complete', requests: 0, pages: 0, active_bots: 0 }}
      />,
    );
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.queryByText(/No matching requests were observed/)).not.toBeInTheDocument();
  });
  it('persists tab selection, renders accessible activity and exports the selected filters', async () => {
    let exportStatus: string | null = null;
    const exportedPages = { value: null as URLSearchParams | null };
    const page = {
      url_hash: 'a'.repeat(64),
      canonical_url: 'https://example.test/page',
      display_path: '/page',
      folder: '/page',
      resource_class: 'page',
      crawl: { state: 'zero', value: 0, coverage: 'complete', reason: null },
      referrals: { state: 'flagged', value: null, coverage: 'partial', reason: 'thresholding' },
      citations: { state: 'not_connected', value: null, coverage: null, reason: null },
      findings: {
        state: 'unavailable',
        value: null,
        coverage: null,
        reason: 'incomplete_coverage',
      },
      key_events: null,
      errors_4xx: 0,
      errors_5xx: 0,
      last_crawl: null,
    };
    mswServer.use(
      http.get(root + '/ai-traffic/overview', () =>
        HttpResponse.json({
          crawl,
          referrals,
          citations: { unit: 'tracked_citations', count: null, label: 'Tracked answers' },
        }),
      ),
      http.get(root + '/crawl-logs/sources', () =>
        HttpResponse.json({ ingestion_enabled: false, items: [] }),
      ),
      http.get(root + '/ai-traffic/coverage', () =>
        HttpResponse.json({ sources: [], items: [], next_cursor: null }),
      ),
      http.get(root + '/crawl-logs/catalog', () =>
        HttpResponse.json({
          catalog_version: '1',
          bots: [],
          presets: {},
          max_batch_bytes: 2000,
          max_line_bytes: 1000,
          max_lines_per_batch: 10,
          upload_sample_lines: 50,
          max_backdate_days: 80,
          worker_timeout_ms: 5000,
        }),
      ),
      http.get(root + '/ai-traffic/activity', () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
      http.get(root + '/ai-traffic/activity/export', ({ request }) => {
        exportStatus = new URL(request.url).searchParams.get('status');
        return new HttpResponse('path,status\n/page,404', {
          headers: { 'content-type': 'text/csv' },
        });
      }),
      http.get(root + '/ai-traffic/referrals', () => HttpResponse.json(referrals)),
      http.get(root + '/ai-traffic/insights', () =>
        HttpResponse.json({
          snapshot_id: null,
          window_start: '2026-10-01',
          window_end: '2026-10-04',
          formula_version: '1',
          patterns: [],
          coverage: {
            crawl: 'partial',
            ga4_complete: false,
            notice: 'Coverage is incomplete. Absence-based insights are unavailable.',
          },
        }),
      ),
      http.get(root + '/ai-traffic/pages', () =>
        HttpResponse.json({
          window_start: '2026-10-01',
          window_end: '2026-10-04',
          items: [page],
          next_cursor: null,
          observed_crawl_coverage: {
            state: 'unavailable',
            share: null,
            known_pages: 10,
            observed_pages: null,
            inventory_date: null,
            inventory_complete: false,
            sample_mode: true,
            label: 'Observed crawl coverage',
          },
        }),
      ),
      http.get(root + '/ai-traffic/pages/' + page.url_hash, () =>
        HttpResponse.json({
          page,
          window_start: '2026-10-01',
          window_end: '2026-10-04',
          crawls: [],
          referrals: [],
          citations: [],
          provenance: { crawl_id: null, formula_version: '1', bounded: false },
        }),
      ),
      http.get(root + '/ai-traffic/pages/export', ({ request }) => {
        exportedPages.value = new URL(request.url).searchParams;
        return new HttpResponse('path\n/page', { headers: { 'content-type': 'text/csv' } });
      }),
    );
    const view = renderWithProviders(<AiTrafficScreen />);
    await screen.findByText(/No matching requests were observed/);
    expect(await screen.findByText(/Absence-based insights are unavailable/)).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('activity');
    // No retained rows: one contextual empty state instead of headers over nothing.
    expect(await screen.findByRole('heading', { name: 'No matching requests' })).toBeVisible();
    expect(
      screen.queryByRole('table', { name: 'Retained automated request activity' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Response status' }), {
      target: { value: '404' },
    });
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(exportStatus).toBe('404'));
    await user.click(screen.getByRole('tab', { name: 'Referrals' }));
    expect(await screen.findByText('No AI-referral data yet')).toBeVisible();
    expect(screen.getByLabelText('Chart interval')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Pages' }));
    await screen.findByRole('table', { name: 'Path-level AI Traffic with separate signal units' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Folder' }), {
      target: { value: '/page' },
    });
    await user.click(screen.getByRole('combobox', { name: 'Resource class' }));
    await user.click(screen.getByRole('option', { name: 'Page' }));
    await user.click(screen.getByRole('combobox', { name: 'Sort pages' }));
    await user.click(screen.getByRole('option', { name: 'AI referral sessions' }));
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(exportedPages.value?.get('folder')).toBe('/page'));
    expect(exportedPages.value?.get('resource_class')).toBe('page');
    expect(exportedPages.value?.get('sort')).toBe('sessions_desc');
    await user.click(
      screen.getByRole('button', { name: 'View AI Traffic for https://example.test/page' }),
    );
    const panel = await screen.findByRole('dialog', { name: '/page' });
    expect(
      new URL(
        within(panel).getByRole('link', { name: 'Referrals' }).getAttribute('href')!,
        window.location.origin,
      ).searchParams.get('project'),
    ).toBe(project.id);
    expect(within(panel).getByText(/0 requests · zero/)).toBeVisible();
    expect(within(panel).getByText(/Unavailable AI referral sessions · flagged/)).toBeVisible();
    expect(within(panel).getByText(/Unavailable tracked citations · not connected/)).toBeVisible();
    expect(
      within(panel).getByText(/Unavailable open Site Health findings · unavailable/),
    ).toBeVisible();
    mswServer.use(
      http.get(
        root + '/ai-traffic/pages/' + page.url_hash,
        () => new HttpResponse(null, { status: 403 }),
      ),
    );
    await view.queryClient.refetchQueries({ predicate: (q) => q.queryKey.includes('url') });
    await waitFor(() =>
      expect(within(panel).queryByText(/0 requests · zero/)).not.toBeInTheDocument(),
    );
  });
});
