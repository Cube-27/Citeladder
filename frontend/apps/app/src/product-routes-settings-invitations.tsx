import {
  AcceptInvitationRouteContent,
  SettingsRouteContent,
} from '@/components/settings/settings-route-content';

/** `/settings` authenticated workspace settings and account tabs. */
export function SettingsRouteElement() {
  return <SettingsRouteContent />;
}

/** `/invitations/accept` authenticated workspace invitation acceptance. */
export function AcceptInvitationRouteElement() {
  return <AcceptInvitationRouteContent />;
}
