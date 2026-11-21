import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { UserMenuTrigger } from '@/components/layout/user-menu';
import { roleLabel } from '@/components/settings/member-roles';
import { FlowBlock, FlowPage } from '@/components/templates/flow-page';
import { AuthRow, AuthRowList, AuthRowTile } from '@/components/ui/auth-shell';
import { StatusMark } from '@/components/ui/status-mark';
import { BrandMark } from '@/components/ui/brand-mark';
import { DisplayTime } from '@/components/ui/display-time';
import type { Workspace } from '@citeladder/contracts';
import { Plus } from '@/lib/icons';
import { workspaceQueries } from '@/lib/api/workspaces';
import { HOME_PATH } from '@/lib/navigation/app-routes';
import { useSelectWorkspace } from '@/lib/navigation/project-destination';
import { ownsWorkspace, WORKSPACE_SETUP_PATH } from '@/lib/project/bootstrap';
import { useProjectContext } from '@/lib/project/project-context';
import { READ_FAILED, StateBlock } from '@/components/ui/state-block';

export function WorkspaceChooser() {
  const { workspaces, status, retry } = useProjectContext();
  const selectWorkspace = useSelectWorkspace();
  const ownsOne = ownsWorkspace(workspaces);

  if (status === 'error')
    return (
      <ChooserFrame>
        <StateBlock
          kind="error"
          title="Couldn't load your workspaces"
          error={null}
          fallback={READ_FAILED}
          onRetry={retry}
        />
      </ChooserFrame>
    );
  if (workspaces.length === 0 && status !== 'no_workspace')
    return (
      <ChooserFrame>
        <StateBlock kind="loading" label="Loading your workspaces…" shape={{ kind: 'list' }} />
      </ChooserFrame>
    );

  const enter = (workspace: Workspace) => {
    selectWorkspace(workspace.id, HOME_PATH);
  };
  return (
    <ChooserFrame>
      <AuthRowList label="Your workspaces">
        {workspaces.map((workspace) => (
          <AuthRow
            key={workspace.id}
            lead={<BrandMark name={workspace.name} />}
            name={workspace.name}
            meta={workspace.role === 'owner' ? 'Your workspace' : roleLabel(workspace.role)}
            trailing={<AccessBadge workspaceId={workspace.id} />}
            action={{ onSelect: () => enter(workspace) }}
          />
        ))}
        {ownsOne ? null : (
          <AuthRow
            lead={<AuthRowTile icon={Plus} />}
            name="Set up your own workspace"
            action={{ link: <Link to={WORKSPACE_SETUP_PATH} /> }}
          />
        )}
      </AuthRowList>
    </ChooserFrame>
  );
}

function ChooserFrame({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <FlowPage
      label="Choose a workspace"
      kicker={null}
      barEnd={<UserMenuTrigger presenter="compact" />}
    >
      <FlowBlock title="Choose a workspace">{children}</FlowBlock>
    </FlowPage>
  );
}

function AccessBadge({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const { data } = useQuery(workspaceQueries.access(workspaceId));
  if (!data) return null;
  switch (data.status) {
    case 'active':
      return null;
    case 'trial_active':
      return (
        <StatusMark variant="status" value="info">
          Trial until <DisplayTime value={data.expires_at} dateOnly />
        </StatusMark>
      );
    case 'trial_expired':
      return (
        <StatusMark variant="status" value="warning">
          Trial ended
        </StatusMark>
      );
    case 'subscription_lapsed':
      return (
        <StatusMark variant="status" value="warning">
          Plan ended
        </StatusMark>
      );
    case 'access_unresolved':
      return (
        <StatusMark variant="status" value="danger">
          Access unavailable
        </StatusMark>
      );
    default: {
      const _exhaustive: never = data.status;
      return _exhaustive;
    }
  }
}
