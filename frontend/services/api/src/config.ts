/**
 * Service configuration: Python-owned policy plus environment overrides.
 *
 * `backend/app/core/config` stays the policy authority (TypeScript migration
 * D5). Defaults, bounds, env names, error codes and the role matrix arrive
 * through `generated/python-config.json`, written by
 * `backend/scripts/export_ts_platform.py` and drift-checked in CI. This module
 * only applies the same environment overrides pydantic-settings would.
 */
import pythonConfig from './generated/python-config.json' with { type: 'json' };
import { epochMicros, parseDatetimeParam } from './http/datetimes.ts';

type SettingSpec = {
  env: string[];
  type: string;
  default: unknown;
  values?: unknown[];
  minimum?: number;
  maximum?: number;
};

export type PythonPolicy = typeof pythonConfig;
export const policy: PythonPolicy = pythonConfig;

const TRUE_VALUES = new Set(['1', 'on', 't', 'true', 'y', 'yes']);
const FALSE_VALUES = new Set(['0', 'off', 'f', 'false', 'n', 'no']);

export class ConfigError extends Error {}

function envValue(spec: SettingSpec, env: Record<string, string | undefined>): string | undefined {
  // pydantic-settings matches environment names case-insensitively.
  const byLowerName = new Map(
    Object.entries(env).map(([name, value]) => [name.toLowerCase(), value]),
  );
  for (const name of spec.env) {
    const value = byLowerName.get(name.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseInteger(name: string, raw: string, spec: SettingSpec): number {
  if (!/^[+-]?\d+$/u.test(raw.trim())) throw new ConfigError(`${name} must be an integer`);
  const value = Number(raw.trim());
  if (spec.minimum !== undefined && value < spec.minimum) {
    throw new ConfigError(`${name} must be >= ${spec.minimum}`);
  }
  if (spec.maximum !== undefined && value > spec.maximum) {
    throw new ConfigError(`${name} must be <= ${spec.maximum}`);
  }
  return value;
}

function parseBoolean(name: string, raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new ConfigError(`${name} must be a boolean`);
}

function parseDatetime(name: string, raw: string): Date | null {
  if (!raw.trim()) return null;
  // pydantic's own parser, so a value Python refuses at boot (a calendar-
  // invalid 2026-02-30, a free-form date) is refused here too.
  const parsed = parseDatetimeParam(raw.trim());
  if (!parsed.ok) throw new ConfigError(`${name} must be a timestamp`);
  // A naive timestamp is kept as "present but unusable"; demo access then
  // fails closed exactly as `demo_access_expired` does for a naive value.
  if (parsed.value.offsetSeconds === null) return new Date(Number.NaN);
  return new Date(Number(epochMicros(parsed.value) / 1000n));
}

function parseSetting(name: string, spec: SettingSpec, raw: string): unknown {
  switch (spec.type) {
    case 'int':
      return parseInteger(name, raw, spec);
    case 'bool':
      return parseBoolean(name, raw);
    case 'datetime':
      return parseDatetime(name, raw);
    case 'literal':
      if (!spec.values?.includes(raw)) {
        throw new ConfigError(`${name} must be one of ${spec.values?.join(', ')}`);
      }
      return raw;
    default:
      return raw;
  }
}

function resolveSetting(name: string, env: Record<string, string | undefined>): unknown {
  const spec: SettingSpec = policy.settings[name as keyof typeof policy.settings];
  const raw = envValue(spec, env);
  return raw === undefined ? spec.default : parseSetting(name, spec, raw);
}

export type ServiceConfig = {
  appName: string;
  appEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  database: {
    poolSize: number;
    maxOverflow: number;
    poolRecycleSeconds: number;
    poolTimeoutSeconds: number;
    connectTimeoutSeconds: number;
    commandTimeoutSeconds: number;
    statementTimeoutMs: number;
    lockTimeoutMs: number;
    idleTransactionTimeoutMs: number;
    sslMode: 'disable' | 'require';
  };
  requestIdHeader: string;
  session: {
    secretKey: string;
    algorithm: 'HS256';
    cookieName: string;
  };
  demo: { enabled: boolean; expiresAt: Date | null };
  readinessTimeoutMs: number;
};

// The TCP port range is a protocol fact, not policy; the default is exported.
const MAX_TCP_PORT = 65_535;

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return policy.api.service_port;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) {
    throw new ConfigError('PORT must be a TCP port number');
  }
  return port;
}

function isDevelopmentEnv(appEnv: string): boolean {
  return policy.development_env_names.includes(appEnv.trim().toLowerCase());
}

/** Mirror of `secret_is_weak` in `backend/app/core/config`, from its exported policy. */
export function secretIsWeak(value: string): boolean {
  const rules = policy.secret_policy;
  return (
    new TextEncoder().encode(value).length < rules.min_bytes ||
    new Set(value).size < rules.min_unique_chars ||
    rules.insecure_values.includes(value) ||
    rules.weak_words.includes(value.trim().toLowerCase())
  );
}

function assertDeployable(config: ServiceConfig): void {
  if (isDevelopmentEnv(config.appEnv)) return;
  // The Python startup check owns the full production policy; this service
  // refuses the two failures that would make its own sessions or data unsafe.
  if (secretIsWeak(config.session.secretKey)) {
    throw new ConfigError('JWT_SECRET_KEY does not meet the production strength policy');
  }
  if (config.database.sslMode !== 'require') {
    throw new ConfigError('db_ssl_mode must be require in production');
  }
}

/** Resolve the service configuration from `env` (defaults to `process.env`). */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServiceConfig {
  const setting = (name: keyof typeof policy.settings) => resolveSetting(name, env);
  const config: ServiceConfig = {
    appName: setting('app_name') as string,
    appEnv: setting('app_env') as string,
    // Every interface by default, as a bridged container needs; a host-network
    // deployment pins loopback, as the Python web process does.
    host: env.HOST?.trim() || '0.0.0.0',
    port: parsePort(env.PORT),
    databaseUrl: setting('database_url') as string,
    database: {
      poolSize: setting('db_pool_size') as number,
      maxOverflow: setting('db_max_overflow') as number,
      poolRecycleSeconds: setting('db_pool_recycle_seconds') as number,
      poolTimeoutSeconds: setting('db_pool_timeout_seconds') as number,
      connectTimeoutSeconds: setting('db_connect_timeout_seconds') as number,
      commandTimeoutSeconds: setting('db_command_timeout_seconds') as number,
      statementTimeoutMs: setting('db_statement_timeout_ms') as number,
      lockTimeoutMs: setting('db_lock_timeout_ms') as number,
      idleTransactionTimeoutMs: setting('db_idle_transaction_timeout_ms') as number,
      sslMode: setting('db_ssl_mode') as 'disable' | 'require',
    },
    requestIdHeader: setting('request_id_header') as string,
    session: {
      secretKey: setting('jwt_secret_key') as string,
      algorithm: setting('jwt_algorithm') as 'HS256',
      cookieName: setting('session_cookie_name') as string,
    },
    demo: {
      enabled: setting('demo_mode') as boolean,
      expiresAt: setting('demo_expires_at') as Date | null,
    },
    readinessTimeoutMs: policy.api.readiness_timeout_seconds * 1000,
  };
  assertDeployable(config);
  return config;
}

/** Fail closed when demo mode has no valid future access deadline. */
export function demoAccessExpired(config: ServiceConfig, now: Date = new Date()): boolean {
  if (!config.demo.enabled) return false;
  const expiresAt = config.demo.expiresAt;
  if (expiresAt === null || Number.isNaN(expiresAt.getTime())) return true;
  return now.getTime() >= expiresAt.getTime();
}
