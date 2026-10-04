import { parseArgs } from 'node:util';
import { required, withOperatorDatabase, operatorMain } from './operator.ts';
import { grantMutation } from '../billing/admin.ts';
await operatorMain(async () => {
  const { values } = parseArgs({
    options: {
      actor: { type: 'string' },
      'workspace-id': { type: 'string' },
      'account-id': { type: 'string' },
      reason: { type: 'string' },
      'idempotency-key': { type: 'string' },
      'monitored-urls': { type: 'string' },
      'valid-from': { type: 'string' },
      'valid-until': { type: 'string' },
      apply: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help)
    console.log(
      'entitlement:site-health --actor ADMIN_EMAIL --workspace-id UUID --account-id UUID --reason REASON --idempotency-key KEY --monitored-urls N --valid-from ISO [--valid-until ISO] [--apply]. Adds an allowance; revoke old evidence separately.',
    );
  else
    await withOperatorDatabase(async (db) => {
      const apply = values.apply === true;
      const result = await grantMutation(
        db,
        {
          actor: required(values.actor, 'actor'),
          reason: required(values.reason, 'reason'),
          idempotencyKey: required(values['idempotency-key'], 'idempotency-key'),
          apply,
        },
        {
          workspaceId: required(values['workspace-id'], 'workspace-id'),
          accountId: required(values['account-id'], 'account-id'),
        },
        {
          kind: 'grant',
          key: 'monitored_urls',
          value: Number(required(values['monitored-urls'], 'monitored-urls')),
          from: new Date(required(values['valid-from'], 'valid-from')),
          until: values['valid-until'] ? new Date(values['valid-until']) : null,
        },
      );
      console.log(JSON.stringify({ dry_run: !apply, result }));
    });
});
