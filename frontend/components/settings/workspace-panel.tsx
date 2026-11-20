import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { restartAt } from '@/lib/auth/account-transition';
import { workspacesApi } from '@/lib/api/workspaces';
import { WORKSPACE_CHOOSER_PATH } from '@/lib/project/bootstrap';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { TEAM_MEMBERS_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

import { MemberSettings } from './member-settings';
import { ROLE_SUMMARY, roleLabel } from './member-roles';
import { Notice } from '@/components/ui/notice';

/**
 * The selected workspace as you stand in it: its name, your role and what that
 * role allows, a way out for anyone but the Owner, and the members for those
 * who manage them.
 */
export function WorkspacePanel() {
  const { activeWorkspace } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  const mayInvite = useEntitlement().hasCapability(TEAM_MEMBERS_CAPABILITY);
  const queryClient = useQueryClient();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = useMutation({
    mutationFn: (workspaceId: string) => workspacesApi.leave(workspaceId),
    // The chooser decides where someone goes next, including setting up their own.
    onSuccess: () => restartAt(queryClient, WORKSPACE_CHOOSER_PATH),
  });
  if (!activeWorkspace) return null;
  const isOwner = activeWorkspace.role === 'owner';

  return (
    <>
      <SettingsGroup title={activeWorkspace.name}>
        <SettingRows>
          <SettingRow
            label="Your role"
            description={ROLE_SUMMARY[activeWorkspace.role]}
            value={roleLabel(activeWorkspace.role)}
          />
        </SettingRows>
      </SettingsGroup>

      {mayManage ? <MemberSettings mayInvite={mayInvite} /> : null}

      {/* Leaving is the tab's one destructive action, so it is the last group. */}
      <SettingsGroup title="Leave workspace">
        {leave.isError ? (
          <Notice
            kind="mutation"
            notice={mutationNoticeForError(leave.error, { action: 'leave the workspace' })}
          />
        ) : null}
        <SettingRows>
          <SettingRow
            label={activeWorkspace.name}
            description={isOwner ? 'Transfer ownership first.' : undefined}
            action={
              isOwner ? null : (
                <Button type="button" variant="danger" onClick={() => setConfirmLeave(true)}>
                  <Icon icon={LogOut} />
                  Leave workspace
                </Button>
              )
            }
          />
        </SettingRows>
      </SettingsGroup>

      <ConfirmDialog
        request={
          confirmLeave
            ? {
                title: 'Leave workspace',
                body: `You lose access to ${activeWorkspace.name} and its projects immediately. An admin can invite you again.`,
                confirmLabel: 'Leave workspace',
                destructive: true,
                onConfirm: () =>
                  leave.mutate(activeWorkspace.id, { onSettled: () => setConfirmLeave(false) }),
              }
            : null
        }
        pending={leave.isPending}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  );
}
