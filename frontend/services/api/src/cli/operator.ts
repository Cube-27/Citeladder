import { loadConfig } from '../config.ts';
import { createDatabase, type Database } from '../db/database.ts';

export function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

/** Connection lifecycle only. Each command's domain owner enforces its own operator authority. */
export async function withOperatorDatabase(run: (db: Database) => Promise<void>) {
  const db = createDatabase(loadConfig());
  try {
    await run(db);
  } finally {
    await db.destroy();
  }
}
