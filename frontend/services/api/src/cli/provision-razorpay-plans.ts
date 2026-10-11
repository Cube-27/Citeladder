import { parseArgs } from 'node:util';
import { required, withOperatorDatabase, operatorMain } from './operator.ts';
import { catalogMutation } from '../billing/admin.ts';
import { catalogRevision } from '../billing/catalog.ts';
import { catalogAuthoring } from '../config/billing-authoring.ts';
import {
  recurringPrices,
  bindPlanRefs,
  verifyPlan,
  RazorpayPlanReader,
  readOperatorJson,
  writeBoundCatalog,
} from '../billing/plan-operators.ts';
import { billingSettings, razorpaySettings } from '../billing/config.ts';
import { configured } from '../billing/razorpay.ts';
import type { Database } from '../db/database.ts';

const HELP = [
  'billing:plans propose|verify|bind --revision REVISION --environment test|live',
  '  bind: --plans refs.json | --plans-json JSON, then --output new-catalog.json',
  '        and/or --import NEW_REVISION [--publish] --actor EMAIL --reason TEXT',
  '        --idempotency-key KEY [--apply] (a dry run unless --apply).',
  'Read-only provider requests; --import writes the bound catalog as a draft',
  'revision (replacing a draft never published) so a Cloud Run job can bind',
  'and publish without local files.',
].join('\n');

function readArguments() {
  return parseArgs({
    allowPositionals: true,
    options: {
      revision: { type: 'string' },
      environment: { type: 'string' },
      plans: { type: 'string' },
      'plans-json': { type: 'string' },
      output: { type: 'string' },
      import: { type: 'string' },
      publish: { type: 'boolean' },
      actor: { type: 'string' },
      reason: { type: 'string' },
      'idempotency-key': { type: 'string' },
      apply: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
}
type Values = ReturnType<typeof readArguments>['values'];

/** The plan references to bind, from a workspace file or inline JSON (Cloud Run has no files). */
async function planRefs(values: Values): Promise<unknown> {
  const inline = values['plans-json'];
  if (inline !== undefined) {
    if (inline.length > catalogAuthoring.maximumInputBytes)
      throw new Error('operator_input_too_large');
    return JSON.parse(inline) as unknown;
  }
  return readOperatorJson(required(values.plans, 'plans'));
}

/** Stores the bound catalog as a draft revision, and publishes it when asked. */
async function importBound(db: Database, values: Values, payload: unknown) {
  const revision = required(values.import, 'import');
  const key = required(values['idempotency-key'], 'idempotency-key');
  const context = {
    actor: required(values.actor, 'actor'),
    reason: required(values.reason, 'reason'),
    idempotencyKey: key,
    apply: values.apply ?? false,
  };
  console.log(
    JSON.stringify(await catalogMutation(db, context, { kind: 'import', revision, payload })),
  );
  if (values.publish)
    console.log(
      JSON.stringify(
        await catalogMutation(
          db,
          { ...context, idempotencyKey: `${key}:publish` },
          { kind: 'publish', revision },
        ),
      ),
    );
}

await operatorMain(async () => {
  const { positionals, values } = readArguments();
  if (values.help) {
    console.log(HELP);
    return;
  }
  const operation = positionals[0];
  if (!['propose', 'verify', 'bind'].includes(operation ?? ''))
    throw new Error('invalid_plan_operation');
  const environment = required(values.environment, 'environment');
  if (!['test', 'live'].includes(environment)) throw new Error('invalid_provider_mode');
  if (operation === 'bind' && !values.output && !values.import)
    throw new Error('bind_destination_required');
  await withOperatorDatabase(async (db) => {
    const saved = await catalogRevision(db, required(values.revision, 'revision'));
    const payload =
      operation === 'bind' ? bindPlanRefs(saved.payload, await planRefs(values)) : saved.payload;
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
    // Authoring admits at most four plans, two modes and two regions: at most sixteen GETs.
    await Promise.all(
      entries.map(async ({ price }) => {
        verifyPlan(await reader.fetchPlan(price.provider_price_ref), price);
      }),
    );
    for (const { key } of entries) console.log(`verified ${saved.revision} ${key}`);
    if (operation !== 'bind') return;
    if (values.output) await writeBoundCatalog(values.output, payload);
    if (values.import) await importBound(db, values, payload);
  });
});
