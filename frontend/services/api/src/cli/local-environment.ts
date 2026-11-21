import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const APP_DATABASE_ROLE = 'citeladder_app';

export function localEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const values: Record<string, string | undefined> = {};
  if (!['1', 'true', 'yes', 'on'].includes(env.CITELADDER_DISABLE_DOTENV?.toLowerCase() ?? '')) {
    const path = fileURLToPath(new URL('../../../../../.env', import.meta.url));
    if (existsSync(path)) Object.assign(values, parseEnv(readFileSync(path, 'utf8')));
  }
  Object.assign(values, env);
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_HOST_PORT } =
    values;
  if (POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_DB && POSTGRES_HOST && POSTGRES_HOST_PORT) {
    const hostname = POSTGRES_HOST.includes(':') ? `[${POSTGRES_HOST}]` : POSTGRES_HOST;
    const url = (role: string) =>
      `postgresql://${encodeURIComponent(role)}:${encodeURIComponent(POSTGRES_PASSWORD)}@${hostname}:${POSTGRES_HOST_PORT}/${encodeURIComponent(POSTGRES_DB)}`;
    values.DATABASE_URL ??= url(APP_DATABASE_ROLE);
    values.MIGRATION_DATABASE_URL ??= url(POSTGRES_USER);
  }
  values.CITELADDER_DISABLE_DOTENV = '1';
  return values;
}
