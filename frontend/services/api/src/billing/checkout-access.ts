import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { WorkspaceEntitlements } from '../entitlements/access.ts';
import { audienceRestricted } from './razorpay.ts';

/**
 * Whether the workspace is on the checkout allow-list (B2): a non-public
 * `billing_checkout` grant the operator issues with `billing:admin grant`.
 * Read only while the audience is restricted; otherwise it cannot matter.
 */
export async function onCheckoutAllowList(
  db: Database,
  config: ServiceConfig,
  workspaceId: string,
) {
  if (!audienceRestricted(config.billing, config.razorpay)) return false;
  return new WorkspaceEntitlements(db, workspaceId).grants(policy.entitlements.billing_checkout);
}
