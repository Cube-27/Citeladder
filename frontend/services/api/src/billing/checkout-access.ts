import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { hasGrantedFlag } from '../entitlements/occupancy.ts';

/**
 * Whether the workspace is on the checkout allow-list (B2): a non-public
 * `billing_checkout` grant the operator issues with `billing:admin grant`.
 */
export function onCheckoutAllowList(db: Database, workspaceId: string) {
  return hasGrantedFlag(db, workspaceId, policy.entitlements.billing_checkout);
}
