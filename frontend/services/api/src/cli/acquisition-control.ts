import { parseArgs } from 'node:util';
import { setAcquisitionControl } from '../web-evidence/control.ts';
import { required, withOperatorDatabase } from './operator.ts';

const { values } = parseArgs({
  options: {
    actor: { type: 'string' },
    domain: { type: 'string' },
    reason: { type: 'string' },
    resume: { type: 'boolean' },
    apply: { type: 'boolean' },
    help: { type: 'boolean' },
  },
});
if (values.help)
  console.log(
    'acquisition:control --actor ADMIN_EMAIL --domain DOMAIN_OR_* --reason REASON [--resume] [--apply]',
  );
else
  await withOperatorDatabase(async (db) =>
    console.log(
      JSON.stringify(
        await setAcquisitionControl(db, {
          actor: required(values.actor, 'actor'),
          domain: required(values.domain, 'domain'),
          reason: required(values.reason, 'reason'),
          resume: values.resume,
          apply: values.apply,
        }),
      ),
    ),
  );
