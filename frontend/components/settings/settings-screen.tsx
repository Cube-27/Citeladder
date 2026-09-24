'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { IntegrationSettings } from '@/components/settings/integration-settings';
import { MemberSettings } from '@/components/settings/member-settings';
import { ProviderSettings } from '@/components/settings/provider-settings';
import { TimeZoneSetting } from '@/components/settings/time-zone-setting';
import { TabPanel, TabsBar, TabsRoot } from '@/components/ui/tabs';
import { PageShell } from '@/components/layout/page-shell';
import { projectsApi } from '@/lib/api/projects';
import { humanizeApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/query-keys';
import { useSessionUser } from '@/lib/auth/session-guard';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_DELETION_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { emailInitials } from '@/lib/utils';
import { useSelectProject, workspaceDestination } from '@/lib/navigation/project-destination';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { textRole } from '@/components/ui/typography';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayTimestamp } from '@/lib/format';

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
  { id: 'members', label: 'Members' },
  { id: 'providers', label: 'Providers' },
  { id: 'integrations', label: 'Integrations' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

/**
 * Members is administrative, so a role without `manage_members` is not shown
 * a tab whose only content would be an explanation of why it is empty. The
 * panel keeps its own guard: hiding the tab is the courtesy, the server is
 * the boundary, and a deep link still lands somewhere honest.
 */
function visibleTabs(mayManageMembers: boolean) {
  return SETTINGS_TABS.filter((tab) => tab.id !== 'members' || mayManageMembers);
}

const SETTINGS_TAB_CODEC = stringUrlCodec(
  SETTINGS_TABS.map((tab) => tab.id),
  'account' as SettingsTab,
);

function ProjectDeletionControls() {
  const router = useNavigate();
  const queryClient = useQueryClient();
  const { activeProject, activeWorkspaceId } = useProjectContext();
  const selectProject = useSelectProject();
  const { hasCapability } = useEntitlement();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: (projectId: string) =>
      projectsApi.deleteProject(projectId, { workspaceId: activeWorkspaceId }),
    onSuccess: async (_data, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      const refreshedProjects = await queryClient.fetchQuery({
        queryKey: queryKeys.projects.list(String(activeWorkspaceId)),
        queryFn: ({ signal }) =>
          projectsApi.listProjects({ signal, workspaceId: activeWorkspaceId }),
      });
      const next = refreshedProjects.find((project) => project.id !== deletedId) ?? null;
      if (next) {
        // Navigate, do not merely re-select: the deleted id may be the one in
        // `?project=`, and leaving it there would resolve to a project that no
        // longer exists and present as "that project is unavailable". Replace
        // rather than push for the same reason — Back must not return to it.
        selectProject(next.id, { replace: true });
        setConfirmOpen(false);
      } else {
        router(
          activeWorkspaceId
            ? workspaceDestination('/onboarding', null, activeWorkspaceId)
            : '/onboarding',
          { replace: true },
        );
      }
    },
  });

  if (!hasCapability(PROJECT_DELETION_CAPABILITY)) return null;
  return (
    <>
      <section className="border-border-subtle grid gap-4 border-t pt-4">
        <EditorialSectionHeader
          title="Danger zone"
          description="Permanently delete the active project and everything inside it."
        />
        {activeProject ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo
                  name={activeProject.brand_name}
                  logoUrl={activeProject.brand?.logo_url}
                  websiteUrl={activeProject.website_url}
                  size="md"
                />
                <div className="grid min-w-0 gap-0.5">
                  <div className={textRole('bodyStrong', 'truncate')}>{activeProject.name}</div>
                  <p className="text-muted text-xs">Brand: {activeProject.brand_name}</p>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-4 shrink-0" aria-hidden />
                Delete project
              </Button>
            </div>
            <Alert tone="danger">
              Deleting a project removes all of its prompts, topics, audits, visibility history, and
              generated content. This cannot be undone.
            </Alert>
            {deleteMutation.isError ? (
              <Alert tone="danger">{humanizeApiError(deleteMutation.error).message}</Alert>
            ) : null}
          </>
        ) : (
          <p className="text-muted text-sm">No project selected.</p>
        )}
      </section>
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleteMutation.isPending) setConfirmOpen(open);
        }}
        title="Delete project"
        description={activeProject ? `Delete "${activeProject.name}"?` : undefined}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => activeProject && deleteMutation.mutate(activeProject.id)}
              disabled={deleteMutation.isPending || !activeProject}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete project'}
            </Button>
          </>
        }
      >
        <p className={textRole('body')}>
          This permanently deletes the project and all of its prompts, topics, audits, visibility
          history, and generated content. This cannot be undone.
        </p>
      </Dialog>
    </>
  );
}

/**
 * SettingsScreen — tabbed settings (Account / Members / Providers / Integrations),
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
// react-doctor-disable-next-line react-doctor/no-giant-component -- this owns tab focus; members, providers, and integrations are extracted.
export function SettingsScreen() {
  const user = useSessionUser();
  const timeZone = useDisplayTimeZone();
  const createdLabel = user.created_at
    ? formatDisplayTimestamp(user.created_at, timeZone)
    : undefined;
  const updatedLabel = user.updated_at
    ? formatDisplayTimestamp(user.updated_at, timeZone)
    : undefined;
  // Deep-linkable initial tab (`/settings?tab=providers` from the onboarding
  // card); invalid/absent values fall back to Account.
  const [requestedTab, setActiveTab] = useUrlState('tab', SETTINGS_TAB_CODEC);
  const mayManageMembers = useWorkspaceCapability('manage_members');
  const tabs = visibleTabs(mayManageMembers);
  // `?tab=members` is deep-linkable, so a non-administrator can arrive asking
  // for a tab that is not offered. Fall back to Account rather than selecting
  // a tab that no longer exists, which would leave no panel visible at all.
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'account';

  return (
    <TabsRoot value={activeTab} onValueChange={setActiveTab}>
      <PageShell
        tabs={
          <TabsBar
            variant="band"
            items={tabs.map((tab) => ({ value: tab.id, label: tab.label }))}
            ariaLabel="Settings sections"
          />
        }
      >
        <TabPanel
          value="account"
          forceMount
          className="focus-ring grid gap-4 data-[state=inactive]:hidden"
        >
          {/* Two columns from lg, not a narrow centred rail. These cards are
            short, so a max-w-2xl column left most of a wide screen empty and
            pushed everything below the fold for no reason. */}
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <section className="grid gap-4">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  // The same solid accent disc as the topbar avatar, one size
                  // up because this one identifies the account rather than
                  // triggering a menu. A pale tint with accent ink read as a
                  // disabled chip beside the address it belongs to.
                  className={textRole(
                    'bodyStrong',
                    'bg-accent text-accent-fg flex size-10 shrink-0 items-center justify-center rounded-full uppercase',
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
            </section>
          </div>

          <TimeZoneSetting />

          <ProjectDeletionControls />
        </TabPanel>

        <TabPanel value="members" forceMount className="focus-ring data-[state=inactive]:hidden">
          <MemberSettings />
        </TabPanel>

        <TabPanel value="providers" forceMount className="focus-ring data-[state=inactive]:hidden">
          <ProviderSettings />
        </TabPanel>

        {/* Not forceMount, unlike its siblings. This panel owns a connection
            list that fans out into a mappings query and a 3s backfill poll per
            connection, so mounting it behind every other tab meant opening
            Profile issued five integration requests and then polled a backfill
            the reader could not see. */}
        <TabPanel value="integrations" className="focus-ring">
          <IntegrationSettings />
        </TabPanel>
      </PageShell>
    </TabsRoot>
  );
}
