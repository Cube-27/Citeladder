import { parseArgs } from 'node:util';
import { required, withOperatorDatabase, operatorMain } from './operator.ts';
import {
  catalogMutation,
  catalogDiff,
  grantMutation,
  inspectAccount,
  redact,
} from '../billing/admin.ts';
import { validateCatalog } from '../billing/catalog-authoring.ts';
import { readOperatorJson } from '../billing/plan-operators.ts';
import { billingSettings, razorpaySettings } from '../billing/config.ts';
import { configured } from '../billing/razorpay.ts';

await operatorMain(async () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      actor: { type: 'string' },
      reason: { type: 'string' },
      'idempotency-key': { type: 'string' },
      apply: { type: 'boolean' },
      help: { type: 'boolean' },
      file: { type: 'string' },
      revision: { type: 'string' },
      environment: { type: 'string' },
      'usd-inr-rate': { type: 'string' },
      'workspace-id': { type: 'string' },
      'account-id': { type: 'string' },
      'grant-id': { type: 'string' },
      key: { type: 'string' },
      value: { type: 'string' },
      'valid-from': { type: 'string' },
      'valid-until': { type: 'string' },
      'effective-from': { type: 'string' },
    },
  });
  if (values.help)
    console.log(
      'billing:admin catalog-validate|catalog-diff|catalog-seed|catalog-import|catalog-publish|account-inspect|grant|revoke --actor ADMIN_EMAIL --reason REASON --idempotency-key KEY [--apply]. Grants require --workspace-id and --account-id; supply stable --valid-from/--effective-from for replay.',
    );
  else {
    const command = positionals[0];
    const payload = values.file ? await readOperatorJson(values.file) : undefined;
    if (command === 'catalog-validate')
      console.log(JSON.stringify(redact(validateCatalog(payload))));
    else
      await withOperatorDatabase(async (db) => {
        if (command === 'catalog-diff') {
          console.log(JSON.stringify(await catalogDiff(db, payload)));
          return;
        }
        const context = {
          actor: required(values.actor, 'actor'),
          reason: required(values.reason, 'reason'),
          idempotencyKey: required(values['idempotency-key'], 'idempotency-key'),
          apply: values.apply === true,
        };
        let result: unknown;
        if (command === 'catalog-seed') {
          const adapter = razorpaySettings();
          const mode = values.environment;
          if (mode !== undefined && mode !== 'test' && mode !== 'live')
            throw new Error('invalid_provider_mode');
          const defaultMode =
            billingSettings().provider === 'razorpay' && configured(adapter) ? adapter.mode : null;
          result = await catalogMutation(db, context, {
            kind: 'seed',
            mode: mode ?? defaultMode,
            rate: values['usd-inr-rate'],
          });
        } else if (command === 'catalog-import')
          result = await catalogMutation(db, context, {
            kind: 'import',
            revision: required(values.revision, 'revision'),
            payload,
          });
        else if (command === 'catalog-publish')
          result = await catalogMutation(db, context, {
            kind: 'publish',
            revision: required(values.revision, 'revision'),
          });
        else {
          const target = {
            workspaceId: required(values['workspace-id'], 'workspace-id'),
            accountId: required(values['account-id'], 'account-id'),
          };
          if (command === 'account-inspect') result = await inspectAccount(db, context, target);
          else if (command === 'grant')
            result = await grantMutation(db, context, target, {
              kind: 'grant',
              key: required(values.key, 'key'),
              value: Number(required(values.value, 'value')),
              from: new Date(required(values['valid-from'], 'valid-from')),
              until: values['valid-until'] ? new Date(values['valid-until']) : null,
            });
          else if (command === 'revoke')
            result = await grantMutation(db, context, target, {
              kind: 'revoke',
              grantId: required(values['grant-id'], 'grant-id'),
              at: new Date(required(values['effective-from'], 'effective-from')),
            });
          else throw new Error('unknown_billing_command');
        }
        console.log(JSON.stringify({ dry_run: !context.apply, result: redact(result) }));
      });
  }
});
