import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { prefetchRoute } from '@/lib/navigation/route-prefetch';
import { mswServer } from '@/test/msw-server';
import { createAppQueryClient } from './query-client';
import { INITIAL_VISIBILITY_PARAMS, visibilityQueries } from './visibility';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

/** Reads the landing selection the way the Visibility screen does. */
function LandingProjection() {
  const query = useQuery(
    visibilityQueries.project(WORKSPACE_ID, PROJECT_ID, INITIAL_VISIBILITY_PARAMS),
  );
  if (query.isPending) return <p>Loading</p>;
  return <p>{query.data === null ? 'No metrics yet' : 'Measured'}</p>;
}

describe('the Visibility landing projection', () => {
  it('is asked for once when the route warmup found no metrics yet', async () => {
    const asked: string[] = [];
    mswServer.use(
      http.get(`/api/v1/audits`, () => HttpResponse.json([])),
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json(
          { error: { message: 'No visibility metrics available for the selected measurement' } },
          { status: 404 },
        );
      }),
    );
    const client = createAppQueryClient();
    const { queryKey } = visibilityQueries.project(
      WORKSPACE_ID,
      PROJECT_ID,
      INITIAL_VISIBILITY_PARAMS,
    );

    prefetchRoute(client, '/visibility', { projectId: PROJECT_ID, workspaceId: WORKSPACE_ID });
    // The warmup's answer has landed before the screen mounts, as it does in the app.
    await vi.waitFor(() => expect(client.getQueryState(queryKey)?.fetchStatus).toBe('idle'));
    expect(client.getQueryState(queryKey)?.status).toBe('success');
    render(
      <QueryClientProvider client={client}>
        <LandingProjection />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('No metrics yet')).toBeVisible();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(asked).toEqual(['?cohort=core&selection_mode=latest']);
  });
});
