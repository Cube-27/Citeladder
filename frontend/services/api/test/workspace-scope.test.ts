import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WorkspaceScope } from '../src/db/workspace-scope.ts';
import { Fixtures, testDatabase } from './support.ts';

const db = testDatabase();
const fixtures = new Fixtures(db);
let ours: string;
let theirs: string;

async function project(workspaceId: string, name: string): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto('projects')
    .values({
      id,
      workspace_id: workspaceId,
      name,
      brand_name: name,
      website_url: 'https://example.test',
      industry: 'software',
      subindustry: 'analytics',
      primary_market: 'US',
      country_code: 'US',
      language_code: 'en',
      benchmark_mode: 'standard',
      default_repetitions: 1,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .execute();
  return id;
}

beforeAll(async () => {
  ours = await fixtures.workspace();
  theirs = await fixtures.workspace();
  await project(ours, 'Ours');
  await project(theirs, 'Theirs');
});

afterAll(async () => {
  await db.deleteFrom('projects').where('workspace_id', 'in', [ours, theirs]).execute();
  await fixtures.cleanup();
  await db.destroy();
});

describe('WorkspaceScope', () => {
  it('reads only the scoped workspace', async () => {
    const rows = await new WorkspaceScope(ours).selectFrom(db, 'projects').select('name').execute();
    expect(rows).toEqual([{ name: 'Ours' }]);
  });

  it('writes only the scoped workspace', async () => {
    await new WorkspaceScope(ours).updateTable(db, 'projects').set({ name: 'Renamed' }).execute();
    await new WorkspaceScope(ours).deleteFrom(db, 'projects').execute();
    const names = await db
      .selectFrom('projects')
      .select('name')
      .where('workspace_id', 'in', [ours, theirs])
      .execute();
    expect(names).toEqual([{ name: 'Theirs' }]);
  });
});
