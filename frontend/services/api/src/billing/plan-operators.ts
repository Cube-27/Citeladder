import { z } from 'zod';
import { realpath, readFile, writeFile } from 'node:fs/promises';
import { dirname, basename, relative, resolve, isAbsolute } from 'node:path';
import { catalogAuthoring } from '../config/billing-authoring.ts';
import { policy } from '../config.ts';
import { validateCatalog } from './catalog-authoring.ts';
import { configured, ProviderError } from './razorpay.ts';
import type { BillingSettings, RazorpaySettings } from './config.ts';
import { amount } from './contracts.ts';

const planReference = z
  .string()
  .regex(/^plan_[A-Za-z0-9]+$/u)
  .max(255);
export function recurringPrices(input: unknown) {
  return validateCatalog(input).plans.flatMap((plan) =>
    Object.entries(plan.regional_byok_prices).flatMap(([region, price]) =>
      price
        ? [
            {
              key: `${plan.key}:${region}`,
              price,
            },
          ]
        : [],
    ),
  );
}
export function bindPlanRefs(input: unknown, inputRefs: unknown) {
  const payload = validateCatalog(input);
  const refs = z.record(z.string(), planReference).parse(inputRefs);
  const entries = recurringPrices(payload);
  if (
    entries.length !== Object.keys(refs).length ||
    entries.some(({ key }) => !Object.hasOwn(refs, key))
  )
    throw new Error('plan_reference_set_mismatch');
  for (const plan of payload.plans)
    for (const [region, price] of Object.entries(plan.regional_byok_prices))
      if (price) price.provider_price_ref = refs[`${plan.key}:${region}`]!;
  return validateCatalog(payload);
}
export function verifyPlan(
  input: unknown,
  price: ReturnType<typeof recurringPrices>[number]['price'],
) {
  const actual = z
    .object({
      id: planReference,
      item: z.object({ name: z.string(), amount, currency: z.enum(['USD', 'INR']) }),
      period: z.literal('monthly'),
      interval: z.literal(1),
    })
    .parse(input);
  if (
    actual.id !== price.provider_price_ref ||
    actual.item.name !== price.provider_plan_name ||
    actual.item.amount !== price.amount_minor + price.tax_minor ||
    actual.item.currency !== price.currency ||
    (price.tax_minor && !price.tax_verified)
  )
    throw new Error('provider_plan_terms_mismatch');
}
export class RazorpayPlanReader {
  private readonly shared: BillingSettings;
  private readonly adapter: RazorpaySettings;
  private readonly transport: typeof fetch;
  constructor(shared: BillingSettings, adapter: RazorpaySettings, transport: typeof fetch = fetch) {
    if (!configured(adapter)) throw new Error('provider_mode_unavailable');
    this.shared = shared;
    this.adapter = adapter;
    this.transport = transport;
  }
  async fetchPlan(reference: string) {
    planReference.parse(reference);
    const credentials = Buffer.from(this.adapter.keyId + ':' + this.adapter.keySecret).toString(
      'base64',
    );
    const response = await this.transport(`${policy.billing.razorpay_origin}/plans/${reference}`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(this.shared.timeoutMs),
      headers: {
        authorization: `Basic ${credentials}`,
      },
    });
    if (!response.ok || response.redirected || !response.body) throw new ProviderError(false);
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > catalogAuthoring.maximumInputBytes)
          throw new ProviderError(false, 'provider_response_too_large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const input: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    );
    if (z.object({ id: planReference }).parse(input).id !== reference)
      throw new Error('provider_plan_reference_mismatch');
    return input;
  }
}
/** Resolve existing paths, including symlinks; new output uses its real parent. */
export async function workspacePath(path: string, output = false) {
  const root = await realpath(process.cwd());
  const resolved = resolve(root, path);
  let actual: string;
  try {
    actual = await realpath(resolved);
  } catch (error) {
    if (!output || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    actual = resolve(await realpath(dirname(resolved)), basename(resolved));
  }
  const rel = relative(root, actual);
  if (
    isAbsolute(rel) ||
    rel === '..' ||
    rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  )
    throw new Error('path_outside_workspace');
  return actual;
}
export async function readOperatorJson(path: string) {
  const data = await readFile(await workspacePath(path));
  if (data.length > catalogAuthoring.maximumInputBytes) throw new Error('operator_input_too_large');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)) as unknown;
}
export async function writeBoundCatalog(path: string, payload: unknown) {
  await writeFile(
    await workspacePath(path, true),
    `${JSON.stringify(validateCatalog(payload), null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
}
