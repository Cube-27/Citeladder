import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import {
  CHATGPT_MODEL,
  CONNECTION_ID,
  WORKSPACE_ID,
  catalogHandler,
  connection,
  failedTestHandler,
} from '@/test/provider-catalog-fixture';

import { ProviderSettings } from './provider-settings';

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  window.localStorage.clear();
  mswServer.use(
    http.get('/api/v1/provider-connections/states', () =>
      HttpResponse.json({ workspace_id: WORKSPACE_ID, providers: [] }),
    ),
  );
});
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('ProviderSettings', () => {
  it('renders a card for all three engines with unconfigured state', async () => {
    mswServer.use(
      catalogHandler(),
      http.get('/api/v1/provider-connections', () => HttpResponse.json([])),
    );

    renderWithProviders(<ProviderSettings />);

    expect(
      await screen.findByRole('heading', { name: 'ChatGPT' }, { timeout: 3_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gemini' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Claude' })).toBeInTheDocument();
    // No connections → every card reads "Missing".
    expect(screen.getAllByText('Missing')).toHaveLength(3);
  });

  it('shows ChatGPT as a fixed direct OpenAI route with no toggle', async () => {
    mswServer.use(
      catalogHandler(),
      http.get('/api/v1/provider-connections', () => HttpResponse.json([])),
    );

    renderWithProviders(<ProviderSettings />);

    const chatgptCard = (await screen.findByRole('heading', { name: 'ChatGPT' })).closest(
      'section',
    )!;
    const utils = within(chatgptCard);
    // Fixed direct route label; the OpenAI model is surfaced.
    expect(utils.getByText('Direct (OpenAI)')).toBeInTheDocument();
    expect(utils.getByText(/gpt-5\.5/)).toBeInTheDocument();
    // No route toggle / radios or alternate route copy.
    expect(utils.queryByRole('radio')).toBeNull();
    expect(utils.queryByText(/coming soon/i)).toBeNull();

    // The other two direct engines carry their own transport labels.
    expect(screen.getByRole('heading', { name: 'Gemini' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Claude' })).toBeInTheDocument();
    expect(screen.getByText('Direct (Google)')).toBeInTheDocument();
    expect(screen.getByText('Direct (Anthropic)')).toBeInTheDocument();
  });

  it('never renders an alternate transport control anywhere on the panel', async () => {
    mswServer.use(
      catalogHandler(),
      http.get('/api/v1/provider-connections', () => HttpResponse.json([])),
    );

    renderWithProviders(<ProviderSettings />);
    await screen.findByRole('heading', { name: 'ChatGPT' });

    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('keeps a saved-but-unprobed key at missing, then connects after a probe', async () => {
    const user = userEvent.setup();
    let created = false;
    let probed = false;
    let createdTransport = '';
    mswServer.use(
      catalogHandler(),
      http.get('/api/v1/provider-connections', () =>
        HttpResponse.json(created ? [connection()] : []),
      ),
      http.post('/api/v1/provider-connections', async ({ request }) => {
        const body = (await request.json()) as { transport_provider: string };
        createdTransport = body.transport_provider;
        created = true;
        return HttpResponse.json(connection(), { status: 201 });
      }),
      http.get('/api/v1/provider-connections/states', () =>
        HttpResponse.json({
          workspace_id: WORKSPACE_ID,
          providers: [
            {
              key: 'chatgpt',
              label: 'ChatGPT',
              // The whole point: a stored key alone is NOT connected.
              state: probed ? 'connected' : 'missing',
              safe_reason: probed ? null : 'verification required',
              grant_key: 'provider.openai',
              latest_probe: null,
            },
          ],
        }),
      ),
      http.post(`/api/v1/provider-connections/${CONNECTION_ID}/test`, () => {
        probed = true;
        return HttpResponse.json({
          connection_id: CONNECTION_ID,
          status: 'ok',
          error_code: '',
          detail: 'Connection succeeded',
          latency_ms: 42,
          logical_engine: 'chatgpt',
          transport_provider: 'openai',
          transport_model: CHATGPT_MODEL,
          tested_at: '2026-07-15T00:00:00Z',
        });
      }),
    );

    renderWithProviders(<ProviderSettings />);

    const chatgptCard = (await screen.findByRole('heading', { name: 'ChatGPT' })).closest(
      'section',
    )!;
    const utils = within(chatgptCard);

    await user.type(utils.getByPlaceholderText(/paste your api key/i), 'sk-test-key');
    await user.click(utils.getByRole('button', { name: /save key/i }));

    // Saving a key does NOT make the engine connected — only a successful
    // probe does. Until then it stays missing.
    await waitFor(() => expect(createdTransport).toBe('openai'));
    expect(utils.getByText('Missing')).toBeInTheDocument();

    await user.click(utils.getByRole('button', { name: /test connection/i }));
    expect(await utils.findByText(/connection succeeded/i)).toBeInTheDocument();
  });

  it('surfaces a failed connection test', async () => {
    const user = userEvent.setup();
    mswServer.use(
      catalogHandler(),
      http.get('/api/v1/provider-connections', () => HttpResponse.json([connection()])),
      failedTestHandler(),
    );

    renderWithProviders(<ProviderSettings />);

    const chatgptCard = (await screen.findByRole('heading', { name: 'ChatGPT' })).closest(
      'section',
    )!;
    const utils = within(chatgptCard);
    expect(utils.getByText('Missing')).toBeInTheDocument();

    await user.click(utils.getByRole('button', { name: /test connection/i }));
    expect(await utils.findByText(/invalid api key/i)).toBeInTheDocument();
  });

  it('never renders the stored secret — key input is empty and write-only', async () => {
    mswServer.use(
      catalogHandler(),
      http.get('/api/v1/provider-connections', () => HttpResponse.json([connection()])),
    );

    renderWithProviders(<ProviderSettings />);

    const chatgptCard = (await screen.findByRole('heading', { name: 'ChatGPT' })).closest(
      'section',
    )!;
    const utils = within(chatgptCard);
    const keyInput = utils.getByPlaceholderText(/stored/i) as HTMLInputElement;
    expect(keyInput).toHaveAttribute('type', 'password');
    expect(keyInput.value).toBe('');
  });
});
