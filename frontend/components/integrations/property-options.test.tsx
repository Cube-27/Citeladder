import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { integrationConnectionSchema } from '@citeladder/contracts/integrations';
import { mswServer } from '@/test/msw-server';
import { projectScope, renderWithProviders } from '@/test/render';
import { makeProject } from '@/test/fixtures/project';

import { usePropertyPicker } from '@/components/settings/property-picker';

import { DataSourceSetup } from './data-source-setup';

const WS = '11111111-1111-4111-8111-111111111111';
const CONN = '33333333-3333-4333-8333-333333333333';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const project = makeProject({ id: PROJECT, workspace_id: WS, name: 'Example' });

const connection = integrationConnectionSchema.parse({
  id: CONN,
  workspace_id: WS,
  grant_id: '22222222-2222-4222-8222-222222222222',
  provider: 'gsc',
  label: '',
  account_ref: '',
  grant_status: 'connected',
  granted_scopes: [],
  last_synced_at: null,
  created_at: '2026-07-20T00:00:00Z',
  updated_at: '2026-07-20T00:00:00Z',
});

function SettingsEntry() {
  const picker = usePropertyPicker(connection);
  return (
    <>
      <button type="button" onClick={picker.open}>
        {picker.label}
      </button>
      {picker.dialog}
    </>
  );
}

const entries = [
  {
    name: 'Settings dialog',
    element: <SettingsEntry />,
    opener: 'Select Search Console property',
  },
  {
    name: 'onboarding data sources',
    element: <DataSourceSetup required={['gsc']} title="Connect Search Console" />,
    opener: 'Choose Search Console property',
  },
];

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('property picker entry points', () => {
  it.each(entries)('saves the chosen property for the project from the $name', async (entry) => {
    const ue = userEvent.setup();
    let saved: unknown = null;
    mswServer.use(
      http.get('/api/v1/integrations', () => HttpResponse.json([connection])),
      http.get(`/api/v1/integrations/${CONN}/mappings`, () => HttpResponse.json([])),
      http.post(`/api/v1/integrations/${CONN}/properties`, () =>
        HttpResponse.json([
          { property_ref: 'sc-domain:example.com', label: 'Domain', matches_project: true },
          { property_ref: 'https://example.com/', label: 'Prefix', matches_project: true },
          { property_ref: 'https://other.test/', label: 'Other', matches_project: false },
        ]),
      ),
      http.post(`/api/v1/integrations/${CONN}/mappings`, async ({ request }) => {
        saved = await request.json();
        return new Promise<never>(() => {});
      }),
    );
    renderWithProviders(entry.element, {
      initialEntries: [`/performance?project=${PROJECT}`],
      projectSelection: projectScope(project),
    });

    await ue.click(await screen.findByRole('button', { name: entry.opener }));
    const group = await screen.findByRole('radiogroup', { name: 'Search Console property' });
    expect(screen.getByRole('radio', { name: /Other/ })).toBeDisabled();
    await ue.click(screen.getByRole('radio', { name: /Prefix/ }));

    await waitFor(() =>
      expect(saved).toEqual({
        provider: 'gsc',
        property_ref: 'https://example.com/',
        project_id: PROJECT,
      }),
    );
    expect(group).toBeInTheDocument();
  });
});
