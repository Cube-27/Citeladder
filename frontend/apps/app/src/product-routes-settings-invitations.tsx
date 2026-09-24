import { BillingScreen } from '@/components/billing/billing-screen';
import {
  AcceptInvitationRouteContent,
  SettingsRouteContent,
} from '@/components/settings/settings-route-content';

/** `/settings` authenticated workspace settings and account tabs. */
export function SettingsRouteElement() {
  return <SettingsRouteContent />;
}

/** `/billing` the workspace's plan, purchases, usage and billing documents. */
export function BillingRouteElement() {
  return <BillingScreen />;
}

/** `/invitations/accept` authenticated workspace invitation acceptance. */
export function AcceptInvitationRouteElement() {
  return <AcceptInvitationRouteContent />;
}
