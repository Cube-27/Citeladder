import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { IntegrationSettings } from '@/components/settings/integration-settings';
import { WorkspacePanel } from '@/components/settings/workspace-panel';
import { McpConnections } from '@/components/settings/mcp-connections';
import { ApiKeys } from '@/components/settings/api-keys';
import { ProviderSettings } from '@/components/settings/provider-settings';
import { TimeZoneSetting } from '@/components/settings/time-zone-setting';
import AccountSecurity from '@/components/settings/account-security';
import { TabPanel, TabRail, TabsRoot } from '@/components/ui/tabs';
import { SettingsPage } from '@/components/templates/settings-page';
import { projectMutations } from '@/lib/api/projects';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { useSessionUser } from '@/lib/auth/session-guard';
import { useEntitlement, useManagedPlan } from '@/lib/billing/entitlement-context';
import { PROJECT_DELETION_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { useSelectProject, workspaceDestination } from '@/lib/navigation/project-destination';
import { SETTINGS_TABS, type SettingsTab } from '@/lib/settings/tabs';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { textRole } from '@/components/ui/typography';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayTimestamp } from '@/lib/format';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

/**
 * Someone who belongs to no workspace yet has only their account to manage;
 * API keys are for the Owners and Admins who manage credentials.
 */
/** A managed plan brings the platform's keys, so it has no provider settings (B32). */
function visibleTabs(hasWorkspace: boolean, managesCredentials: boolean, managed: boolean) {
  return SETTINGS_TABS.filter(
    (tab) =>
      tab.value === 'account' ||
      (hasWorkspace &&
        (tab.value !== 'api-keys' || managesCredentials) &&
        (tab.value !== 'providers' || !managed)),
  );
}

const SETTINGS_TAB_CODEC = stringUrlCodec(
  SETTINGS_TABS.map((tab) => tab.value),
  'account' as SettingsTab,
);

function ProjectDeletionControls() {
  const router = useNavigate();
  const { activeProject, activeWorkspaceId } = useProjectContext();
  const selectProject = useSelectProject();
  const { hasCapability } = useEntitlement();
  const mayDelete = useWorkspaceCapability('delete_projects');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = useMutation(projectMutations.remove(activeWorkspaceId));
  const deleteProject = (projectId: string) =>
    deleteMutation.mutate(projectId, {
      onSuccess: (remaining, deletedId) => {
        const next = remaining.find((project) => project.id !== deletedId) ?? null;
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
      {/* Settings has no project-scoped tab, so it stays under Account, last. */}
      <SettingsGroup title="Delete project">
        {deleteMutation.isError ? (
          <Notice
            kind="mutation"
            notice={mutationNoticeForError(deleteMutation.error, { action: 'delete the project' })}
          />
        ) : null}
        {activeProject ? (
          <SettingRows>
            <SettingRow
              label={activeProject.name}
              action={
                <Button
                  variant="danger"
                  onClick={() => setConfirmOpen(true)}
                  disabled={deleteMutation.isPending}
                >
                  <Icon icon={Trash2} />
                  Delete project
                </Button>
              }
            />
          </SettingRows>
        ) : (
          <StateBlock kind="empty" inline message="No project is selected." />
        )}
      </SettingsGroup>
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
              variant="danger"
              onClick={() => activeProject && deleteProject(activeProject.id)}
              disabled={deleteMutation.isPending || !activeProject}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete project'}
            </Button>
          </>
        }
      >
        <p className={textRole('body', 'text-ink-2')}>
          Deletes its prompts, topics, audits, visibility history and generated content. Cannot be
          undone.
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
  const managed = useManagedPlan();
  const tabs = visibleTabs(activeWorkspace !== null, managesCredentials, managed);
  // `?tab=` is deep-linkable, so someone can arrive asking for a tab that is
  // not offered. Fall back to Account rather than selecting
  // a tab that no longer exists, which would leave no panel visible at all.
  const activeTab = tabs.some((tab) => tab.value === requestedTab) ? requestedTab : 'account';

  return (
    <TabsRoot value={activeTab} onValueChange={setActiveTab} orientation="vertical">
      <SettingsPage rail={<TabRail items={tabs} ariaLabel="Settings sections" />}>
        <TabPanel value="account" forceMount className="focus-ring data-[state=inactive]:hidden">
          <SettingsGroup title="Profile">
            <SettingRows>
              <SettingRow label={user.email} action={<Avatar name={user.email} />} />
              {createdLabel ? <SettingRow label="Account created" value={createdLabel} /> : null}
              {updatedLabel ? <SettingRow label="Last updated" value={updatedLabel} /> : null}
            </SettingRows>
          </SettingsGroup>
          <TimeZoneSetting />
          <AccountSecurity />
          <ProjectDeletionControls />
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
      </SettingsPage>
    </TabsRoot>
  );
}
