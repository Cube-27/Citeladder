/**
 * PostgreSQL pool and Kysely instance.
 *
 * Mirrors `backend/app/core/database.py`: the same pool size, recycle age,
 * acquisition and command timeouts, and the same server-side statement, lock
 * and idle-in-transaction timeouts. Alembic stays the only schema author
 * (TypeScript migration D4); this service holds generated types, never
 * migrations.
 */
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import type { ServiceConfig } from '../config.ts';
import type { DB } from '../generated/db-schema.ts';
import { observeConnection } from './committed-work.ts';

export type Database = Kysely<DB>;
export type DatabaseConfig = Pick<ServiceConfig, 'database' | 'databaseUrl' | 'appName'> & {
  execution?: Pick<ServiceConfig['execution'], 'runnerJob' | 'poolSize'>;
};

/** Accept the backend's SQLAlchemy URL (`postgresql+asyncpg://`) unchanged. */
export function libpqUrl(databaseUrl: string): string {
  return databaseUrl.replace(/^postgres(?:ql)?\+[a-z0-9_]+:\/\//iu, 'postgresql://');
}

export function poolOptions(config: DatabaseConfig): pg.PoolConfig {
  const db = config.database;
  return {
    connectionString: libpqUrl(config.databaseUrl),
    // SQLAlchemy allows pool_size + max_overflow concurrent connections.
    max: db.poolSize + db.maxOverflow,
    maxLifetimeSeconds: db.poolRecycleSeconds,
    // node-postgres applies one bound to both waiting for a pooled client and
    // opening a new one; SQLAlchemy splits it into pool and connect timeouts.
    connectionTimeoutMillis: Math.max(db.poolTimeoutSeconds, db.connectTimeoutSeconds) * 1000,
    query_timeout: db.commandTimeoutSeconds * 1000,
    statement_timeout: db.statementTimeoutMs,
    lock_timeout: db.lockTimeoutMs,
    idle_in_transaction_session_timeout: db.idleTransactionTimeoutMs,
    application_name: config.appName,
    // asyncpg's `ssl="require"` encrypts without verifying the certificate.
    ssl: db.sslMode === 'require' ? { rejectUnauthorized: false } : false,
  };
}

export function createDatabase(
  config: DatabaseConfig,
  options: { execution?: boolean } = {},
): Database {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        ...poolOptions(config),
        ...(options.execution || config.execution?.runnerJob
          ? { max: config.execution?.poolSize }
          : {}),
      }),
      onCreateConnection: (connection) => {
        observeConnection(connection);
        return Promise.resolve();
      },
    }),
  });
}
