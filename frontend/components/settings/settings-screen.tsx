import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
import { Text } from '@/components/ui/typography';
import { Avatar } from '@/components/ui/avatar';
import { SettingRow, SettingRows, SettingsGroup, RowAction } from '@/components/ui/setting-row';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayTimestamp } from '@/lib/format';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { SectionStack } from '@/components/ui/section';

function visibleTabs(hasWorkspace: boolean, managesCredentials: boolean, managed: boolean) {
  return SETTINGS_TABS.filter(
    (tab) =>
      tab.value === 'account' ||
      (hasWorkspace &&
        (tab.value !== 'api-keys' || managesCredentials) &&
        (tab.value !== 'providers' || !managed)),
  );
}

const SETTINGS_TAB_CODEC = stringUrlCodec<SettingsTab>(
  SETTINGS_TABS.map((tab) => tab.value),
  'account',
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

  if (!hasCapability(PROJECT_DELETION_CAPABILITY) || !mayDelete) return null;
  return (
    <>
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
                <RowAction
                  kind="delete"
                  label="Delete project"
                  onClick={() => setConfirmOpen(true)}
                  disabled={deleteMutation.isPending}
                />
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
        <Text as="p" variant="body" tone="ink-2">
          Deletes its prompts, topics, audits, visibility history and generated content. Cannot be
          undone.
        </Text>
      </Dialog>
    </>
  );
}

// react-doctor-disable-next-line react-doctor/no-giant-component
export function SettingsScreen() {
  const user = useSessionUser();
  const timeZone = useDisplayTimeZone();
  const createdLabel = user.created_at
    ? formatDisplayTimestamp(user.created_at, timeZone)
    : undefined;
  const updatedLabel = user.updated_at
    ? formatDisplayTimestamp(user.updated_at, timeZone)
    : undefined;
  const [requestedTab, setActiveTab] = useUrlState('tab', SETTINGS_TAB_CODEC);
  const { activeWorkspace } = useProjectContext();
  const managesCredentials = useWorkspaceCapability('manage_credentials');
  const managed = useManagedPlan();
  const tabs = visibleTabs(activeWorkspace !== null, managesCredentials, managed);
  const activeTab = tabs.some((tab) => tab.value === requestedTab) ? requestedTab : 'account';

  return (
    <TabsRoot value={activeTab} onValueChange={setActiveTab} orientation="vertical">
      <SettingsPage
        rail={{
          nav: <TabRail items={tabs} ariaLabel="Settings sections" />,
          section: 'reading',
        }}
      >
        <TabPanel value="account" forceMount className="data-[state=inactive]:hidden">
          <SectionStack>
            <SettingsGroup title="Profile">
              <SettingRows>
                <SettingRow label={user.email} action={<Avatar name={user.email} />} />
                {createdLabel ? <SettingRow label="Account created" value={createdLabel} /> : null}
                {updatedLabel ? <SettingRow label="Last updated" value={updatedLabel} /> : null}
              </SettingRows>
            </SettingsGroup>
            <TimeZoneSetting />
            <AccountSecurity />
          </SectionStack>
        </TabPanel>

        <TabPanel value="workspace" forceMount className="data-[state=inactive]:hidden">
          <SectionStack>
            <WorkspacePanel />
            <ProjectDeletionControls />
          </SectionStack>
        </TabPanel>

        <TabPanel value="providers" forceMount className="data-[state=inactive]:hidden">
          <ProviderSettings />
        </TabPanel>

        <TabPanel value="integrations">
          <SectionStack>
            <IntegrationSettings />
          </SectionStack>
        </TabPanel>
        <TabPanel value="connections">
          <SectionStack>
            <McpConnections />
          </SectionStack>
        </TabPanel>
        <TabPanel value="api-keys">
          <SectionStack>
            <ApiKeys />
          </SectionStack>
        </TabPanel>
      </SettingsPage>
    </TabsRoot>
  );
}
