'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { humanizeApiError } from '@/lib/api/errors';
import { clearAccountScopedClientState } from '@/lib/auth/account-transition';
import { workspacesApi } from '@/lib/api/workspaces';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { WORKSPACE_CHOOSER_PATH } from '@/lib/project/bootstrap';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

import { MemberSettings } from './member-settings';
import { ROLE_SUMMARY, roleLabel } from './member-roles';

/**
 * The selected workspace as you stand in it: its name, your role and what that
 * role allows, a way out for anyone but the Owner, and the members for those
 * who manage them.
 */
export function WorkspacePanel() {
  const { activeWorkspace } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  const queryClient = useQueryClient();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = useMutation({
    mutationFn: (workspaceId: string) => workspacesApi.leave(workspaceId),
    onSuccess: async () => {
      await clearAccountScopedClientState(queryClient);
      // The chooser decides where someone goes next, including setting up their own.
      hardNavigate(WORKSPACE_CHOOSER_PATH);
    },
  });
  if (!activeWorkspace) return null;
  const isOwner = activeWorkspace.role === 'owner';

  return (
    <Stack gap="section">
      <Stack as="section" gap="compact" aria-labelledby="workspace-panel-title">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="workspace-panel-title" className={textRole('sectionTitle')}>
            {activeWorkspace.name}
          </h2>
          <Badge variant="neutral">{isOwner ? 'Owner' : roleLabel(activeWorkspace.role)}</Badge>
        </div>
        <p className={textRole('body')}>{ROLE_SUMMARY[activeWorkspace.role]}</p>
        {isOwner ? (
          <p className={textRole('caption')}>
            To leave this workspace, make another member its owner first.
          </p>
        ) : (
          <Button
            type="button"
            variant="destructiveGhost"
            size="sm"
            className="w-fit"
            onClick={() => setConfirmLeave(true)}
          >
            <LogOut className="size-3.5" aria-hidden />
            Leave workspace
          </Button>
        )}
        {leave.isError ? (
          <Alert tone="danger">{humanizeApiError(leave.error).message}</Alert>
        ) : null}
      </Stack>

      {mayManage ? (
        <MemberSettings />
      ) : (
        <Alert tone="info">
          The owner and admins manage who belongs to this workspace and what each person may do.
        </Alert>
      )}

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
    </Stack>
  );
}
