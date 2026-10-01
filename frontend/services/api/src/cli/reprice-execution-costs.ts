import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadConfig } from '../config.ts';
import { createDatabase } from '../db/database.ts';
import { repriceExecutions } from '../audits/repricing.ts';
const { values } = parseArgs({
  options: {
    'formula-version': { type: 'string' },
    'pricing-version': { type: 'string' },
    'artifact-id': { type: 'string', multiple: true },
    'workspace-id': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values['formula-version'] || !values['pricing-version'])
  throw new Error('Both formula-version and pricing-version are required');
const ids = values['artifact-id']?.map((id) => z.uuid().parse(id)),
  workspaceId = values['workspace-id'] ? z.uuid().parse(values['workspace-id']) : undefined;
const db = createDatabase(loadConfig());
try {
  process.stdout.write(
    `${JSON.stringify(await repriceExecutions(db, { formulaVersion: values['formula-version'], pricingVersion: values['pricing-version'], artifactIds: ids, workspaceId, dryRun: values['dry-run'] }))}\n`,
  );
} finally {
  await db.destroy();
}
