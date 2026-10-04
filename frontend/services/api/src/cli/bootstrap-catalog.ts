import { parseArgs } from 'node:util';
import { withOperatorDatabase, operatorMain } from './operator.ts';
import { initializeCatalog } from '../billing/admin.ts';
import { billingSettings, razorpaySettings } from '../billing/config.ts';
import { configured } from '../billing/razorpay.ts';

await operatorMain(async () => {
  const { values } = parseArgs({
    options: { actor: { type: 'string' }, help: { type: 'boolean' } },
  });
  if (values.help)
    console.log(
      'bootstrap:catalog [--actor ADMIN_EMAIL]. Runs after identity provisioning; without actor, configured-development branch only.',
    );
  else {
    const demo = /^(true|1|yes|on|t|y)$/iu.test(process.env.DEMO_MODE ?? 'false');
    const localSkip =
      ['development', 'dev', 'local', 'test', 'testing'].includes(
        (process.env.APP_ENV ?? 'development').trim().toLowerCase(),
      ) && !process.env.DEV_LOGIN_PASSWORD;
    if (!values.actor && (demo || localSkip))
      console.log('Catalog initialization skipped with identity bootstrap.');
    else {
      const actor = values.actor ?? process.env.DEV_LOGIN_EMAIL ?? 'dev@citeladder.com';
      const adapter = razorpaySettings();
      const mode =
        billingSettings().provider === 'razorpay' && configured(adapter) ? adapter.mode : null;
      await withOperatorDatabase(async (db) => {
        const row = await initializeCatalog(db, actor, mode);
        console.log(JSON.stringify({ revision: row.revision }));
      });
    }
  }
});
