import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import type { ProbeStatus } from '@citeladder/contracts/probes';

import { apiClient } from './client';
import { probeQueries } from './probes';

const SCOPE = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: '11111111-1111-4111-8111-111111111111',
};
const run = (state: 'running' | 'ready', answers: number): NonNullable<ProbeStatus['latest']> => ({
  launch_id: '22222222-2222-4222-8222-222222222222',
  state,
  created_at: '2026-11-24T00:00:00Z',
  engines: ['claude'],
  markets: [{ id: null, country_code: 'US', language_code: 'en' }],
  answers,
  planned: 3,
  failed: 0,
});
const quote = (balance: number): ProbeStatus['quote'] => ({
  credential_mode: 'funded',
  engines: ['claude'],
  available_engines: ['claude'],
  blocked: null,
  markets: [{ id: null, country_code: 'US', language_code: 'en' }],
  questions: 1,
  repetitions: 3,
  max_repetitions: 3,
  answers: 3,
  credits: 300,
  balance,
  fingerprint: 'f',
});

afterEach(() => vi.restoreAllMocks());

it('polls only the runs while a probe is busy, then reads the whole status once it ends', async () => {
  const client = new QueryClient();
  const options = probeQueries.status(SCOPE);
  client.setQueryData(options.queryKey, {
    quote: quote(1000),
    latest: run('running', 0),
    schedule: null,
  });
  const runsPath = `/projects/${SCOPE.projectId}/probes/runs`;
  const statusPath = `/projects/${SCOPE.projectId}/probes`;
  const get = vi
    .spyOn(apiClient, 'get')
    .mockResolvedValueOnce({ latest: run('running', 2), schedule: null })
    .mockResolvedValueOnce({ latest: run('ready', 3), schedule: null })
    .mockResolvedValueOnce({ quote: quote(700), latest: run('ready', 3), schedule: null });

  const busy = await client.fetchQuery({ ...options, staleTime: 0 });
  expect([busy.latest?.answers, busy.quote.balance]).toEqual([2, 1000]);
  const done = await client.fetchQuery({ ...options, staleTime: 0 });
  expect([done.latest?.state, done.quote.balance]).toEqual(['ready', 700]);
  expect(get.mock.calls.map(([path]) => path)).toEqual([runsPath, runsPath, statusPath]);
});
