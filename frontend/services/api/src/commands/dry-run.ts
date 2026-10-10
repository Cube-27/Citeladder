/** The dry-run mode MCP previews use: the real command, rolled back. */
import type { Database } from '../db/database.ts';
import { operatorTransaction } from '../db/operator-transaction.ts';

export type CommandOptions = Readonly<{ dryRun?: boolean }>;

/**
 * Run `command`; a dry run makes every check, admission and write it would,
 * then rolls all of them back and returns what it would have returned.
 */
export function execute<T>(
  db: Database,
  { dryRun = false }: CommandOptions,
  command: (db: Database) => Promise<T>,
): Promise<T> {
  return dryRun ? operatorTransaction(db, false, command) : command(db);
}
