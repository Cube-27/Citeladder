import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import type { ProbeQuote } from '@citeladder/contracts/probes';

import { apiClient } from '@/lib/api/client';
import { renderWithProviders } from '@/test/render';

import { ProbeDialog } from './probe-dialog';

const SCOPE = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: '11111111-1111-4111-8111-111111111111',
};
const ALL: ProbeQuote = {
  credential_mode: 'funded',
  engines: ['chatgpt', 'claude'],
  available_engines: ['chatgpt', 'claude'],
  blocked: null,
  markets: [{ id: null, country_code: 'US', language_code: 'en' }],
  questions: 3,
  repetitions: 3,
  max_repetitions: 3,
  answers: 18,
  credits: 640,
  balance: 1000,
  fingerprint: 'all',
};
const NARROWED: ProbeQuote = {
  ...ALL,
  engines: ['claude'],
  answers: 9,
  credits: 270,
  fingerprint: 'claude-only',
};
const ONCE: ProbeQuote = {
  ...NARROWED,
  repetitions: 1,
  answers: 3,
  credits: 90,
  fingerprint: 'claude-once',
};

afterEach(() => vi.restoreAllMocks());

it('re-quotes the AI credits for the chosen engines and repetitions and runs the probe on them only', async () => {
  const get = vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
    if (path.endsWith('repetitions=1')) return { quote: ONCE, latest: null, schedule: null };
    return path.includes('/probes?') ? { quote: NARROWED, latest: null, schedule: null } : {};
  });
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue([]);
  const onClose = vi.fn();
  renderWithProviders(
    <ProbeDialog scope={SCOPE} quote={ALL} intent={{ kind: 'run' }} onClose={onClose} />,
  );
  expect(screen.getByText('640')).toBeInTheDocument();
  const [chatgpt, claude] = screen.getAllByRole('checkbox');
  await userEvent.click(chatgpt!);
  expect(await screen.findByText('270')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith(
    `/projects/${SCOPE.projectId}/probes?engines=claude&repetitions=3`,
    expect.anything(),
  );
  await userEvent.click(claude!);
  expect(screen.getByRole('button', { name: 'Run probe' })).toBeDisabled();
  await userEvent.click(claude!);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run probe' })).toBeEnabled());
  await userEvent.click(screen.getByRole('radio', { name: '1' }));
  expect(await screen.findByText('90')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run probe' })).toBeEnabled());
  await userEvent.click(screen.getByRole('checkbox', { name: 'Web search' }));
  await userEvent.click(screen.getByRole('button', { name: 'Run probe' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(post).toHaveBeenCalledWith(
    `/projects/${SCOPE.projectId}/probes`,
    { fingerprint: 'claude-once', engines: ['claude'], repetitions: 1, web_search: true },
    expect.anything(),
  );
});

it('runs without web search unless it is ticked, and offers no web search on a schedule', async () => {
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue([]);
  const onClose = vi.fn();
  const { unmount } = renderWithProviders(
    <ProbeDialog scope={SCOPE} quote={ALL} intent={{ kind: 'run' }} onClose={onClose} />,
  );
  expect(screen.getByRole('checkbox', { name: 'Web search' })).not.toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Run probe' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(post).toHaveBeenCalledWith(
    `/projects/${SCOPE.projectId}/probes`,
    { fingerprint: 'all', web_search: false },
    expect.anything(),
  );
  unmount();
  renderWithProviders(
    <ProbeDialog
      scope={SCOPE}
      quote={ALL}
      intent={{ kind: 'schedule', cadence: 'weekly' }}
      onClose={onClose}
    />,
  );
  expect(screen.getByRole('button', { name: 'Probe weekly' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Web search' })).toBeNull();
});
