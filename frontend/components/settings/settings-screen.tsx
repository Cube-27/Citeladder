'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { IntegrationSettings } from '@/components/settings/integration-settings';
import { WorkspacePanel } from '@/components/settings/workspace-panel';
import { McpConnections } from '@/components/settings/mcp-connections';
import { ApiKeys } from '@/components/settings/api-keys';
import { ProviderSettings } from '@/components/settings/provider-settings';
import { TimeZoneSetting } from '@/components/settings/time-zone-setting';
import { roleLabel } from '@/components/settings/member-roles';
import AccountSecurity from '@/components/settings/account-security';
import { TabPanel, TabsBar, TabsRoot } from '@/components/ui/tabs';
import { PageShell } from '@/components/layout/page-shell';
import { projectsApi } from '@/lib/api/projects';
import { humanizeApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/query-keys';
import { useSessionUser } from '@/lib/auth/session-guard';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_DELETION_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { useSelectProject, workspaceDestination } from '@/lib/navigation/project-destination';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { textRole } from '@/components/ui/typography';
import { Stack } from '@/components/ui/layout';
import { EditorialSectionHeader, ledgerClasses, splitPaneClasses } from '@/components/ui/workspace';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayTimestamp } from '@/lib/format';

/** One read-only account detail row: label + value. */
function DetailRow({
  label,
  children,
  numeric = false,
}: Readonly<{ label: string; children: React.ReactNode; numeric?: boolean }>) {
  return (
    <div className="grid grid-cols-[minmax(0,180px)_1fr] items-center gap-4 py-3">
      <dt className={textRole('label')}>{label}</dt>
      <dd className={numeric ? 'type-caption tabular-nums' : 'type-body text-foreground'}>
        {children}
      </dd>
    </div>
  );
}

const SETTINGS_TABS = [
  { id: 'account', label: 'Account' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'providers', label: 'Providers' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'connections', label: 'MCP connections' },
  { id: 'api-keys', label: 'API keys' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

/**
 * Someone who belongs to no workspace yet has only their account to manage;
 * API keys are for the Owners and Admins who manage credentials.
 */
function visibleTabs(hasWorkspace: boolean, managesCredentials: boolean) {
  return SETTINGS_TABS.filter(
    (tab) =>
      tab.id === 'account' || (hasWorkspace && (tab.id !== 'api-keys' || managesCredentials)),
  );
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
  const mayDelete = useWorkspaceCapability('delete_projects');
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

  // Both must allow it: the plan grants deletion, and the role (Owner/Admin) may use it.
  if (!hasCapability(PROJECT_DELETION_CAPABILITY) || !mayDelete) return null;
  return (
    <>
      <Stack as="section" gap="workspace">
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
                  <div className={textRole('itemTitle', 'truncate')}>{activeProject.name}</div>
                  <p className="type-caption">Brand: {activeProject.brand_name}</p>
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
          <p className="type-body">No project selected.</p>
        )}
      </Stack>
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
 * SettingsScreen — tabbed settings (Account / Workspace / Providers / Integrations),
 * following the WAI-ARIA tabs idiom used by the Visibility
 * workspace (roving tabindex, Arrow/Home/End navigation, `aria-selected`,
 * labelled panels).
 *
 * - **Account**: your email and your role in the selected workspace, display
 *   timezone and account security controls. No internal identifiers.
 * - **Workspace**: the selected workspace, your role, leaving it, and its
 *   members for those who manage them.
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
  const { activeWorkspace } = useProjectContext();
  const managesCredentials = useWorkspaceCapability('manage_credentials');
  const tabs = visibleTabs(activeWorkspace !== null, managesCredentials);
  // `?tab=` is deep-linkable, so someone can arrive asking for a tab that is
  // not offered. Fall back to Account rather than selecting
  // a tab that no longer exists, which would leave no panel visible at all.
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'account';

  return (
    <TabsRoot value={activeTab} onValueChange={setActiveTab}>
      <PageShell
        measure="workflow"
        tabs={
          <TabsBar
            variant="band"
            items={tabs.map((tab) => ({ value: tab.id, label: tab.label }))}
            ariaLabel="Settings sections"
          />
        }
      >
        <TabPanel value="account" forceMount className="focus-ring data-[state=inactive]:hidden">
          <Stack gap="section">
            {/* Two columns from lg, not a narrow centred rail. These cards are
            short, so a max-w-2xl column left most of a wide screen empty and
            pushed everything below the fold for no reason. */}
            <div className={splitPaneClasses('peers')}>
              <Stack as="section" gap="workspace">
                <div className="flex items-center gap-4">
                  <Avatar name={user.email} size="md" />
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <div className={textRole('itemTitle', 'truncate')}>{user.email}</div>
                    {activeWorkspace ? (
                      <div className="type-body">
                        {activeWorkspace.role === 'owner'
                          ? `Owner of ${activeWorkspace.name}`
                          : `${roleLabel(activeWorkspace.role)} in ${activeWorkspace.name}`}
                      </div>
                    ) : null}
                  </div>
                </div>

                <dl className={ledgerClasses('open', 'border-border-subtle border-t')}>
                  {createdLabel ? (
                    <DetailRow label="Account created" numeric>
                      {createdLabel}
                    </DetailRow>
                  ) : null}
                  {updatedLabel ? (
                    <DetailRow label="Last updated" numeric>
                      {updatedLabel}
                    </DetailRow>
                  ) : null}
                </dl>
              </Stack>
              <Stack gap="section">
                <TimeZoneSetting />
                <AccountSecurity />
              </Stack>
            </div>

            <ProjectDeletionControls />
          </Stack>
        </TabPanel>

        <TabPanel value="workspace" forceMount className="focus-ring data-[state=inactive]:hidden">
          <WorkspacePanel />
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
        <TabPanel value="connections" className="focus-ring">
          <McpConnections />
        </TabPanel>
        <TabPanel value="api-keys" className="focus-ring">
          <ApiKeys />
        </TabPanel>
      </PageShell>
    </TabsRoot>
  );
}
