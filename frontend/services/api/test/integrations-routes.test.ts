import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { seedProject } from './referral-fixtures.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { Fixtures } from './support.ts';

const config = testConfig();
const db = testDatabase(config);
const app = createApp(config, db);
const fixtures = new Fixtures(db);
let ownerId: string;
let workspaceId: string;
let connectionId: string;
let foreignConnectionId: string;
let projectId: string;
const projectConnections: string[] = [];

async function grant(workspace: string, transport: 'google_oauth' | 'microsoft_oauth') {
  const grantId = randomUUID();
  const now = new Date();
  await db
    .insertInto('integration_oauth_grants')
    .values({
      id: grantId,
      workspace_id: workspace,
      transport,
      access_token_encrypted: 'ciphertext',
      refresh_token_encrypted: 'ciphertext',
      token_expires_at: null,
      token_revision: 1,
      refresh_claim_id: null,
      refresh_claim_expires_at: null,
      granted_scopes: JSON.stringify([]),
      status: 'connected',
      created_at: now,
      updated_at: now,
    })
    .execute();
  return grantId;
}

async function connection(
  workspace: string,
  grantId: string,
  provider: 'gsc' | 'ga4' | 'bing',
): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db
    .insertInto('integration_connections')
    .values({
      id,
      workspace_id: workspace,
      grant_id: grantId,
      provider,
      label: `Recorded ${provider}`,
      account_ref: `recorded-${provider}`,
      dataset_capabilities: JSON.stringify({}),
      last_synced_at: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
}

async function mapToProject(connectionId: string, provider: 'gsc' | 'ga4' | 'bing') {
  await db
    .insertInto('integration_property_mappings')
    .values({
      id: randomUUID(),
      workspace_id: workspaceId,
      connection_id: connectionId,
      provider,
      property_ref: provider === 'ga4' ? '123456789' : 'https://example.test',
      project_id: projectId,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    })
    .execute();
}

async function get(path: string, selectedWorkspace = workspaceId, authenticated = true) {
  const headers: Record<string, string> = { 'x-workspace-id': selectedWorkspace };
  if (authenticated) {
    const token = await sessionToken({ sub: ownerId, ver: 0 });
    headers.cookie = `${config.session.cookieName}=${token}`;
  }
  const response = await app.request(path, { headers });
  return { status: response.status, body: (await response.json()) as unknown };
}

beforeAll(async () => {
  ownerId = await fixtures.user();
  const foreignOwnerId = await fixtures.user();
  workspaceId = await fixtures.ownedWorkspace(ownerId);
  const foreignWorkspaceId = await fixtures.ownedWorkspace(foreignOwnerId);
  const googleGrant = await grant(workspaceId, 'google_oauth');
  const microsoftGrant = await grant(workspaceId, 'microsoft_oauth');
  const foreignGoogleGrant = await grant(foreignWorkspaceId, 'google_oauth');
  connectionId = await connection(workspaceId, googleGrant, 'gsc');
  foreignConnectionId = await connection(foreignWorkspaceId, foreignGoogleGrant, 'gsc');
  const ga4Connection = await connection(workspaceId, googleGrant, 'ga4');
  const bingConnection = await connection(workspaceId, microsoftGrant, 'bing');
  projectConnections.push(connectionId, ga4Connection, bingConnection);
  projectId = await seedProject(db, workspaceId);
  await mapToProject(connectionId, 'gsc');
  await mapToProject(ga4Connection, 'ga4');
  await mapToProject(bingConnection, 'bing');
});

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

describe('integration connection routes', () => {
  it('lists only the active workspace connections', async () => {
    const result = await get('/api/v1/integrations');
    expect(result.status).toBe(200);
    const connections = result.body as { id: string; workspace_id: string }[];
    expect(connections.map((item) => item.id).sort()).toEqual([...projectConnections].sort());
    expect(connections.every((item) => item.workspace_id === workspaceId)).toBe(true);
  });

  it('enqueues every mapped provider, including Bing, for Performance sync', async () => {
    const token = await sessionToken({ sub: ownerId, ver: 0 });
    const response = await app.request(`/api/v1/projects/${projectId}/performance/sync`, {
      method: 'POST',
      headers: {
        cookie: `${config.session.cookieName}=${token}`,
        'x-workspace-id': workspaceId,
      },
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { connection_id: string; status: string }[];
    expect(body.map((row) => row.connection_id).sort()).toEqual([...projectConnections].sort());
    expect(body.every((row) => row.status === 'queued')).toBe(true);
  });

  it('hides another workspace connection and requires authentication', async () => {
    const foreign = await get(`/api/v1/integrations/${foreignConnectionId}/syncs`);
    expect(foreign.status).toBe(404);
    expect((await get('/api/v1/integrations', workspaceId, false)).status).toBe(401);
  });
});
