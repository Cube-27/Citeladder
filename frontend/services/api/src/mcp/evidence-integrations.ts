import type { Database } from '../db/database.ts';
import { readProjectReadiness } from '../integrations/readiness.ts';
import type { Evidence, ReadScope } from './types.ts';

export async function readIntegrationStatus(db: Database, scope: ReadScope): Promise<Evidence> {
  return readProjectReadiness(db, scope);
}
