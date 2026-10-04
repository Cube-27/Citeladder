import { parseArgs } from 'node:util';
import { required, withOperatorDatabase, operatorMain } from './operator.ts';
import { provisionWorkspaceBilling } from '../entitlements/bootstrap.ts';
await operatorMain(async () => {
  const { values } = parseArgs({
    options: {
      actor: { type: 'string' },
      'workspace-id': { type: 'string' },
      reason: { type: 'string' },
      apply: { type: 'boolean' },
      'development-allowance': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help)
    console.log(
      'billing:backfill --actor ADMIN_EMAIL --workspace-id UUID --reason REASON [--apply] [--development-allowance N]. Default preview; target one workspace.',
    );
  else {
    const developmentAllowance =
      values['development-allowance'] === undefined
        ? undefined
        : Number(values['development-allowance']);
    if (
      developmentAllowance !== undefined &&
      (!Number.isSafeInteger(developmentAllowance) || developmentAllowance < 1)
    )
      throw new Error('invalid_development_allowance');
    await withOperatorDatabase(async (db) => {
      console.log(
        JSON.stringify(
          await provisionWorkspaceBilling(db, {
            actor: required(values.actor, 'actor'),
            workspaceId: required(values['workspace-id'], 'workspace-id'),
            reason: required(values.reason, 'reason'),
            apply: values.apply,
            developmentAllowance,
          }),
        ),
      );
    });
  }
});
