import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';

import { loadConfig, type ServiceConfig } from '../src/config.ts';
import { createDatabase, type Database } from '../src/db/database.ts';

const TEST_SESSION_KEY = 'api-service-test-session-key-0123456789abcdef';

/** Deterministic test configuration; never inherits a live environment. */
export function testConfig(overrides: Record<string, string> = {}): ServiceConfig {
  const databaseUrl = process.env.API_TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'API_TEST_DATABASE_URL must name a disposable, Alembic-migrated PostgreSQL database; the suite writes and deletes fixture rows there.',
    );
  }
  return loadConfig({
    APP_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_SECRET_KEY: TEST_SESSION_KEY,
    ...overrides,
  });
}

export function testDatabase(config: ServiceConfig = testConfig()): Database {
  return createDatabase(config);
}

export function sessionToken(claims: Record<string, unknown>, key = TEST_SESSION_KEY) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(key));
}

/** Rows created by one test file, removed again in `cleanup`. */
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
        is_active: options.active ?? true,
        session_version: options.sessionVersion ?? 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    this.users.push(id);
    return id;
  }

  async workspace(options: { system?: boolean } = {}): Promise<string> {
    const id = randomUUID();
    await this.db
      .insertInto('workspaces')
      .values({
        id,
        name: `Workspace ${id}`,
        is_system: options.system ?? false,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    this.workspaces.push(id);
    return id;
  }

  async member(workspaceId: string, userId: string, role: string): Promise<void> {
    await this.db
      .insertInto('workspace_members')
      .values({
        id: randomUUID(),
        workspace_id: workspaceId,
        user_id: userId,
        role,
        product_tour_status: 'not_started',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
  }

  async cleanup(): Promise<void> {
    if (this.workspaces.length) {
      await this.db.deleteFrom('workspaces').where('id', 'in', this.workspaces).execute();
    }
    if (this.users.length) {
      await this.db.deleteFrom('users').where('id', 'in', this.users).execute();
    }
  }
}
