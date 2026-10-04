import { parseArgs } from 'node:util';
import { provisionPlatformConnections } from '../providers/platform-provisioning.ts';
import { withOperatorDatabase } from './operator.ts';

const { values } = parseArgs({
  options: {
    'credential-ref': { type: 'string', multiple: true },
    apply: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log(
    'provision:platform --credential-ref TRANSPORT=OPAQUE_REFERENCE [--apply | --dry-run] (preview by default; no keys, no provider calls)',
  );
} else {
  if (values.apply && values['dry-run']) throw new Error('Choose either --apply or --dry-run');
  const references: Record<string, string> = {};
  for (const item of values['credential-ref'] ?? []) {
    const separator = item.indexOf('=');
    if (separator < 1) throw new Error('--credential-ref requires TRANSPORT=REFERENCE');
    references[item.slice(0, separator)] = item.slice(separator + 1);
  }
  if (!Object.keys(references).length) throw new Error('At least one --credential-ref is required');
  await withOperatorDatabase(async (db) =>
    console.log(
      JSON.stringify(await provisionPlatformConnections(db, references, { apply: values.apply })),
    ),
  );
}
