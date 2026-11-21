import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { catalogHandler } from './provider-catalog-fixture';

const TEST_WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const defaultHandlers = [
  http.get('/api/v1/workspaces', () =>
    HttpResponse.json([
      {
        id: TEST_WORKSPACE_ID,
        name: 'Test Workspace',
        role: 'owner',
        capabilities: [
          'manage_billing',
          'manage_credentials',
          'manage_members',
          'read',
          'run',
          'write',
        ],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]),
  ),
  catalogHandler(),
];

export const mswServer = setupServer(...defaultHandlers);
