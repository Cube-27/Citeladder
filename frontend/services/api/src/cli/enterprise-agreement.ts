import { parseArgs } from 'node:util';
import { policy } from '../config.ts';
import { recordAgreementReference } from '../workspaces/enterprise-agreements.ts';
import { required, withOperatorDatabase } from './operator.ts';

const { values } = parseArgs({
  options: {
    actor: { type: 'string' },
    apply: { type: 'boolean' },
    help: { type: 'boolean' },
  },
});
if (values.help)
  console.log(
    'agreement:record --actor ADMIN_EMAIL [--apply] < LOCAL_REFERENCE_JSON (JSON on stdin; never a contract body)',
  );
else {
  const actor = required(values.actor, 'actor');
  if (process.stdin.isTTY) throw new Error('Pipe the agreement reference JSON to stdin');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > policy.workspaces.agreement_input_max_bytes)
      throw new Error('Agreement reference input is too large');
    chunks.push(buffer);
  }
  const payload: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
  );
  await withOperatorDatabase(async (db) => {
    const row = await recordAgreementReference(db, actor, payload, values.apply);
    console.log(
      JSON.stringify({
        workspace: row.workspace_id,
        reference: row.reference,
        apply: values.apply === true,
      }),
    );
  });
}
