import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { WorkspaceEntitlements } from '../entitlements/access.ts';
import { audienceRestricted } from './razorpay.ts';

export async function onCheckoutAllowList(
  db: Database,
  config: ServiceConfig,
  workspaceId: string,
) {
  if (!audienceRestricted(config.billing, config.razorpay)) return false;
  return new WorkspaceEntitlements(db, workspaceId).grants(policy.entitlements.billing_checkout);
}
