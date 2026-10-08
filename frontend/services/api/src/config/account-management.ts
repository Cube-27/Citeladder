import { databaseSettings } from '../config.ts';
import type { DatabaseConfig } from '../db/database.ts';

/** Terminal operators need one database connection, not API/provider startup secrets. */
export function accountDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  if (!env.DATABASE_URL?.trim()) throw new Error('explicit_database_required');
  return {
    appName: 'CiteLadder account manager',
    databaseUrl: env.DATABASE_URL,
    database: { ...databaseSettings(env), poolSize: 1, maxOverflow: 0 },
  };
}
