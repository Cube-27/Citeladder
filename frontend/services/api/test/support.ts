import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';

import { authorize, type Authorized, type Permission } from '../src/commands/permission.ts';
import { loadConfig, type ServiceConfig } from '../src/config.ts';
import { createDatabase, type Database } from '../src/db/database.ts';
import { fixtureWorkspaceName } from './fixture-workspace.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';

const TEST_SESSION_KEY = 'api-service-test-session-key-0123456789abcdef';

export function testConfig(overrides: Record<string, string> = {}): ServiceConfig {
  const databaseUrl = process.env.API_TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'API_TEST_DATABASE_URL must name the migrated local database (`pnpm test:api` sets it); the suite writes and deletes fixture rows there.',
    );
  }
  return loadConfig({
    APP_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_SECRET_KEY: TEST_SESSION_KEY,
    ...overrides,
  });
}

export function signupTestConfig(overrides: Record<string, string> = {}): ServiceConfig {
  const config = testConfig(overrides);
  config.auth.signupReservedDomains = [];
  return config;
}

export function testDatabase(config: ServiceConfig = testConfig()): Database {
  return createDatabase(config);
}

export function ownerDatabaseUrl(): string {
  const url = process.env.API_TEST_OWNER_DATABASE_URL;
  if (!url)
    throw new Error(
      'API_TEST_OWNER_DATABASE_URL must name the schema owner of the test database (`pnpm test:api` sets it).',
    );
  return url;
}

/**
 * Run fixture work as the schema owner. The code under test connects as the
 * application role, which cannot update or delete append-only evidence,
 * attempt and ledger rows; a test that arranges or removes them does it here.
 */
export async function asOwner<T>(work: (owner: Database) => Promise<T>): Promise<T> {
  const owner = createDatabase(testConfig({ DATABASE_URL: ownerDatabaseUrl() }));
  try {
    return await work(owner);
  } finally {
    await owner.destroy();
  }
}

export function ownerActor<P extends Permission>(
  workspaceId: string,
  userId: string,
  required: P,
): Authorized<P> {
  return authorize({ kind: 'member', workspaceId, userId, role: 'owner', scopes: 'all' }, required);
}

export function sessionToken(claims: Record<string, unknown>, key = TEST_SESSION_KEY) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(key));
}

export class Fixtures {
  private readonly users: string[] = [];
  private readonly workspaces: string[] = [];
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async user(options: { active?: boolean; sessionVersion?: number } = {}): Promise<string> {
    const id = randomUUID();
    await this.db
      .insertInto('users')
      .values({
        id,
        email: `${id}@example.test`,
        role: 'user',
        registration_origin: 'operator',
        is_active: options.active ?? true,
        session_version: options.sessionVersion ?? 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    this.users.push(id);
    return id;
  }

  async ownedWorkspace(ownerId: string, options: { access?: boolean } = {}): Promise<string> {
    const insert = async (trx: Database) => {
      const workspaceId = await this.insertWorkspace(trx, false);
      await this.insertMember(trx, workspaceId, ownerId, 'owner');
      if (options.access !== false) {
        const account = await billingAccount(trx, workspaceId);
        for (const key of [
          'workspace_access',
          'team_members',
          'crawl_logs',
          'commerce',
          'search_intelligence',
        ])
          await grant(trx, account, { key, value: 1, sourceKind: 'override' }); // NOSONAR -- one transaction connection; grants serialize.
        for (const [key, value] of [
          ['prompt_runs_per_period', 100_000],
          ['project_slots', 1_000],
          ['prompt_slots', 10_000],
          ['ai_credits', 1_000_000],
        ] as const)
          await grant(trx, account, { key, value, sourceKind: 'override', fixtureDefault: true }); // NOSONAR -- one transaction connection; grants serialize.
      }
      return workspaceId;
    };
    const id = this.db.isTransaction
      ? await insert(this.db)
      : await this.db.transaction().execute(insert);
    this.workspaces.push(id);
    return id;
  }

  async joinedWorkspace(
    userId: string,
    options: { access?: boolean; role?: 'admin' | 'member' | 'viewer' } = {},
  ): Promise<string> {
    const id = await this.ownedWorkspace(await this.user(), options);
    await this.member(id, userId, options.role ?? 'admin');
    return id;
  }

  async systemWorkspace(): Promise<string> {
    const id = await this.insertWorkspace(this.db, true);
    this.workspaces.push(id);
    return id;
  }

  async member(workspaceId: string, userId: string, role: string): Promise<void> {
    await this.insertMember(this.db, workspaceId, userId, role);
  }

  private async insertWorkspace(db: Database, system: boolean): Promise<string> {
    const id = randomUUID();
    await db
      .insertInto('workspaces')
      .values({
        id,
        name: fixtureWorkspaceName(id),
        is_system: system,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    return id;
  }

  private async insertMember(
    db: Database,
    workspaceId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    await db
      .insertInto('workspace_members')
      .values({
        id: randomUUID(),
        workspace_id: workspaceId,
        user_id: userId,
        role,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
  }

  async cleanup(): Promise<void> {
    if (this.workspaces.length) {
      // The append-only ledger does not cascade; every audit holds prompt runs.
      const workspaces = this.workspaces;
      await asOwner((owner) =>
        owner.deleteFrom('consumable_ledger').where('workspace_id', 'in', workspaces).execute(),
      );
      await this.db.deleteFrom('workspaces').where('id', 'in', this.workspaces).execute();
    }
    if (this.users.length) {
      await this.db.deleteFrom('users').where('id', 'in', this.users).execute();
    }
  }
}
