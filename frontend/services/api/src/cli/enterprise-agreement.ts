import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { recordAgreementReference } from '../workspaces/enterprise-agreements.ts';
import { required, withOperatorDatabase } from './operator.ts';

const { values } = parseArgs({
  options: {
    actor: { type: 'string' },
    input: { type: 'string' },
    apply: { type: 'boolean' },
    help: { type: 'boolean' },
  },
});
if (values.help)
  console.log(
    'agreement:record --actor ADMIN_EMAIL --input LOCAL_REFERENCE_JSON [--apply] (never a contract body)',
  );
else {
  const payload: unknown = JSON.parse(await readFile(required(values.input, 'input'), 'utf8'));
  await withOperatorDatabase(async (db) => {
    const row = await recordAgreementReference(
      db,
      required(values.actor, 'actor'),
      payload,
      values.apply,
    );
    console.log(
      JSON.stringify({
        workspace: row.workspace_id,
        reference: row.reference,
        apply: values.apply === true,
      }),
    );
  });
}
