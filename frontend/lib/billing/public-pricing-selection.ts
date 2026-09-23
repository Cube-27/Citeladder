import { createIdempotencyKey } from '@/lib/api/billing';
import { PRICING_RETURN_PATH } from '@/lib/config/billing';
import {
  clearPendingIntent,
  writePendingIntent,
  type PendingIntentKind,
  type PendingPricingIntentV1,
} from './pending-pricing-intent';

export type PublicPricingSelection = Pick<
  PendingPricingIntentV1,
  'kind' | 'catalog_key' | 'quantity' | 'byok'
>;
const KINDS = new Set<string>(['checkout', 'addon', 'topup']);

function singleFields(params: URLSearchParams): boolean {
  return ['kind', 'catalog_key', 'quantity', 'byok'].every(
    (name) => params.getAll(name).length === 1,
  );
}

function validKey(key: string | null): key is string {
  return key !== null && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(key);
}

export function parsePublicPricingSelection(
  params: URLSearchParams,
): PublicPricingSelection | null {
  const kind = params.get('kind');
  const key = params.get('catalog_key');
  const quantity = Number(params.get('quantity'));
  const byok = params.get('byok');
  if (!singleFields(params)) return null;
  if (!kind || !KINDS.has(kind) || !validKey(key)) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return null;
  if (byok !== '0' && byok !== '1') return null;
  return { kind: kind as PendingIntentKind, catalog_key: key, quantity, byok: byok === '1' };
}

export function publicPricingSelectionHref(
  selection: PublicPricingSelection,
  appOrigin: URL,
): string {
  const params = new URLSearchParams({
    kind: selection.kind,
    catalog_key: selection.catalog_key,
    quantity: String(selection.quantity),
    byok: selection.byok ? '1' : '0',
  });
  if (!parsePublicPricingSelection(params)) throw new Error('Invalid pricing selection.');
  return new URL(`${PRICING_RETURN_PATH}?${params}`, appOrigin).toString();
}

/** Capture before the login redirect; the URL carries no account data. */
export function capturePublicPricingSelection(url: URL): boolean {
  if (!['kind', 'catalog_key', 'quantity', 'byok'].some((key) => url.searchParams.has(key))) {
    return false;
  }
  const selection = parsePublicPricingSelection(url.searchParams);
  if (selection) {
    writePendingIntent({
      version: 1,
      ...selection,
      country_code: null,
      billing_details: null,
      idempotency_key: createIdempotencyKey(),
      return_path: PRICING_RETURN_PATH,
      created_at_ms: Date.now(),
    });
  } else {
    clearPendingIntent();
  }
  return true;
}
