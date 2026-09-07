'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IntegrationSettings } from '@/components/settings/integration-settings';
import { BillingSettings } from '@/components/settings/billing-settings';
import { ProviderSettings } from '@/components/settings/provider-settings';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { useSessionUser } from '@/lib/auth/session-guard';
import { emailInitials } from '@/lib/utils';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { textRole } from '@/components/ui/typography';

/** Human-readable label for a timestamp (falls back to the raw value).
 * Explicit locale + UTC keep server and client output identical, so the
 * SSR markup matches during hydration. */
function formatTimestamp(timestamp: string | undefined): string | undefined {
  if (!timestamp) return undefined;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/** One read-only account detail row: label + value. */
function DetailRow({
  label,
  children,
  mono = false,
}: Readonly<{ label: string; children: React.ReactNode; mono?: boolean }>) {
  return (
    <div className="border-border-subtle grid min-h-12 grid-cols-[minmax(0,180px)_1fr] items-center gap-4 border-b py-2 last:border-b-0">
      <dt className={textRole('bodyStrong')}>{label}</dt>
      <dd className={mono ? 'mono text-secondary text-xs' : 'text-foreground text-sm'}>
        {children}
      </dd>
    </div>
  );
}

const SETTINGS_TABS = [
  { id: 'account', label: 'Account' },
  { id: 'billing', label: 'Billing' },
  { id: 'providers', label: 'Providers' },
  { id: 'integrations', label: 'Integrations' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

const SETTINGS_TAB_CODEC = stringUrlCodec(
  SETTINGS_TABS.map((tab) => tab.id),
  'account' as SettingsTab,
);

/**
 * SettingsScreen — tabbed settings (Account / Billing / Providers / Integrations),
 * following the WAI-ARIA tabs idiom used by the Visibility
 * workspace (roving tabindex, Arrow/Home/End navigation, `aria-selected`,
 * labelled panels).
 *
 * - **Account**: read-only session details from `GET /auth/me` via
 *   `useSessionUser` (no account-mutation endpoints exist) plus the
 *   appearance/theme control. `role` is the ACCOUNT-level role (free-form,
 *   defaults to `"user"`) and `created_at` is when the account was created —
 *   neither is a workspace membership role.
 * - **Provider Settings**: the BYOK provider configuration (formerly the
 *   settings-owned Providers tab), rendered by `ProviderSettings`.
 * - **Integrations**: first-party data connections (GSC/GA4 on one shared
 *   Google OAuth grant, Bing on a Microsoft grant), rendered by
 *   `IntegrationSettings`. `?tab=integrations` is the OAuth-callback landing
 *   surface (contract C2).
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- this owns tab focus; billing, providers, and integrations are extracted.
export function SettingsScreen() {
  const user = useSessionUser();
  const createdLabel = formatTimestamp(user.created_at);
  const updatedLabel = formatTimestamp(user.updated_at);
  // Deep-linkable initial tab (`/settings?tab=providers` from the onboarding
  // card); invalid/absent values fall back to Account.
  const [activeTab, setActiveTab] = useUrlState('tab', SETTINGS_TAB_CODEC);

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        items={SETTINGS_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
        ariaLabel="Settings sections"
        rootClassName="grid gap-[var(--page-section-gap)]"
      >
        <TabPanel value="billing" forceMount className="focus-ring data-[state=inactive]:hidden">
          <BillingSettings enabled={activeTab === 'billing'} />
        </TabPanel>

        <TabPanel value="account" forceMount className="focus-ring data-[state=inactive]:hidden">
          {/* Two columns from lg, not a narrow centred rail. These cards are
            short, so a max-w-2xl column left most of a wide screen empty and
            pushed everything below the fold for no reason. */}
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Read-only — shown for reference.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <span
                    aria-hidden
                    className={textRole(
                      'bodyStrong',
                      'bg-accent-soft text-accent-text flex size-10 shrink-0 items-center justify-center rounded-full uppercase',
                    )}
                  >
                    {emailInitials(user.email)}
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <div className={textRole('bodyStrong', 'truncate')}>{user.email}</div>
                    <div className="text-muted text-sm capitalize">{user.role}</div>
                  </div>
                  <Badge variant="status" value={user.is_active ? 'success' : 'danger'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                {/* Only what the header above does NOT already state. Email, role
                  and status were each rendered twice — once in the identity row
                  and again as a detail row. */}
                <dl className="border-border-subtle mt-[var(--card-padding-large)] border-t">
                  {createdLabel ? (
                    <DetailRow label="Account created" mono>
                      {createdLabel}
                    </DetailRow>
                  ) : null}
                  {updatedLabel ? (
                    <DetailRow label="Last updated" mono>
                      {updatedLabel}
                    </DetailRow>
                  ) : null}
                  {user.id ? (
                    <DetailRow label="User ID" mono>
                      {user.id}
                    </DetailRow>
                  ) : null}
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="providers" forceMount className="focus-ring data-[state=inactive]:hidden">
          <ProviderSettings />
        </TabPanel>

        <TabPanel
          value="integrations"
          forceMount
          className="focus-ring data-[state=inactive]:hidden"
        >
          <IntegrationSettings />
        </TabPanel>
      </Tabs>
    </div>
  );
}
