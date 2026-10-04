import { parseArgs } from 'node:util';
import { required, withOperatorDatabase, operatorMain } from './operator.ts';
import { catalogRevision } from '../billing/catalog.ts';
import {
  recurringPrices,
  bindPlanRefs,
  verifyPlan,
  RazorpayPlanReader,
  workspacePath,
  readOperatorJson,
  writeBoundCatalog,
} from '../billing/plan-operators.ts';
import { billingSettings, razorpaySettings } from '../billing/config.ts';
import { configured } from '../billing/razorpay.ts';
await operatorMain(async () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      revision: { type: 'string' },
      environment: { type: 'string' },
      plans: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help)
    console.log(
      'billing:plans propose|verify|bind --revision REVISION --environment test|live [--plans refs.json --output new-catalog.json]. Read-only provider requests; bind writes a local new-revision payload.',
    );
  else {
    const operation = positionals[0];
    if (!['propose', 'verify', 'bind'].includes(operation ?? ''))
      throw new Error('invalid_plan_operation');
    const environment = required(values.environment, 'environment');
    if (!['test', 'live'].includes(environment)) throw new Error('invalid_provider_mode');
    await withOperatorDatabase(async (db) => {
      const saved = await catalogRevision(db, required(values.revision, 'revision'));
      const payload =
        operation === 'bind'
          ? bindPlanRefs(
              saved.payload,
              await readOperatorJson(await workspacePath(required(values.plans, 'plans'))),
            )
          : saved.payload;
      const entries = recurringPrices(payload);
      if (!entries.length || entries.some(({ price }) => price.provider_mode !== environment))
        throw new Error('catalog_environment_mismatch');
      if (operation === 'propose') {
        for (const entry of entries) {
          const { provider_price_ref: _ref, ...spec } = entry.price;
          console.log(JSON.stringify({ revision: saved.revision, key: entry.key, spec }));
        }
        return;
      }
      const adapter = razorpaySettings();
      if (!configured(adapter) || adapter.mode !== environment)
        throw new Error('configured_provider_environment_mismatch');
      const reader = new RazorpayPlanReader(billingSettings(), adapter);
      for (const { key, price } of entries) {
        verifyPlan(await reader.fetchPlan(price.provider_price_ref), price);
        console.log(`verified ${saved.revision} ${key}`);
      }
      if (operation === 'bind') await writeBoundCatalog(required(values.output, 'output'), payload);
    });
  }
});
