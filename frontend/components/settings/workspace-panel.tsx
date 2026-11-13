import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { restartAt } from '@/lib/auth/account-transition';
import { workspacesApi } from '@/lib/api/workspaces';
import { WORKSPACE_CHOOSER_PATH } from '@/lib/project/bootstrap';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { TEAM_MEMBERS_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

import { MemberSettings } from './member-settings';
import { ROLE_SUMMARY, roleLabel } from './member-roles';
import { TextLink } from '@/components/ui/text-link';
import { PLANS_HREF } from '@/lib/billing/plan-limit';

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
    <Stack gap="section">
      <Stack as="section" gap="compact" aria-labelledby="workspace-panel-title">
        <Inline className="flex-wrap">
          <h2 id="workspace-panel-title" className={textRole('sectionTitle')}>
            {activeWorkspace.name}
          </h2>
          <Badge>{roleLabel(activeWorkspace.role)}</Badge>
        </Inline>
        {/* What the role allows and, for the Owner, the way out: one line. */}
        <p className={textRole('body')}>
          {ROLE_SUMMARY[activeWorkspace.role]}
          {isOwner ? ' To leave, first make another member the owner.' : null}
        </p>
        {isOwner ? null : (
          <Button
            type="button"
            variant="danger"
            className="w-fit"
            onClick={() => setConfirmLeave(true)}
          >
            <Icon icon={LogOut} />
            Leave workspace
          </Button>
        )}
        {leave.isError ? (
          <MutationNotice
            notice={mutationNoticeForError(leave.error, { action: 'leave the workspace' })}
          />
        ) : null}
      </Stack>

      {mayManage && !mayInvite ? (
        <Callout tone="info">
          Inviting team members is part of a paid plan. During the trial, this workspace is yours
          alone. <TextLink href={PLANS_HREF}>See plans</TextLink>
        </Callout>
      ) : null}
      {mayManage ? (
        <MemberSettings mayInvite={mayInvite} />
      ) : (
        <Callout tone="info">
          The owner and admins manage who belongs to this workspace and what each person may do.
        </Callout>
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
