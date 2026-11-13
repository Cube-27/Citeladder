import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { UserMenuTrigger } from '@/components/layout/user-menu';
import { roleLabel } from '@/components/settings/member-roles';
import { AuthCard, AuthRow, AuthRowList, AuthRowTile, AuthShell } from '@/components/ui/auth-shell';
import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { Callout } from '@/components/ui/callout';
import { DisplayTime } from '@/components/ui/display-time';
import { QueryState } from '@/components/ui/query-state';
import type { Workspace } from '@citeladder/contracts';
import { workspaceQueries } from '@/lib/api/workspaces';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { ownsWorkspace, soleOwnedWorkspace, WORKSPACE_SETUP_PATH } from '@/lib/project/bootstrap';
import { useProjectContext } from '@/lib/project/project-context';

/**
 * Where a signed-in person goes next: their own workspace (or setting one up
 * when they own none) and every workspace they were invited to. Someone with
 * exactly one destination goes straight there.
 */
export function WorkspaceChooser() {
  const { workspaces, status, setActiveWorkspaceId } = useProjectContext();
  const navigate = useNavigate();
  const ownsOne = ownsWorkspace(workspaces);
  // A fresh document never shows this: the route loader sends it on before
  // anything paints. This covers arriving here from inside the app.
  const only = soleOwnedWorkspace(workspaces);

  useEffect(() => {
    if (status === 'no_workspace') navigate(WORKSPACE_SETUP_PATH, { replace: true });
    else if (only) {
      setActiveWorkspaceId(only.id);
      navigate(workspaceDestination('/projects', null, only.id), { replace: true });
    }
  }, [navigate, only, setActiveWorkspaceId, status]);

  if (status === 'error')
    return (
      <ChooserFrame>
        <Callout tone="negative">Your workspaces could not be loaded. Reload to try again.</Callout>
      </ChooserFrame>
    );
  if (workspaces.length === 0 || only)
    return <QueryState kind="loading" label="Loading your workspaces…" />;

  const enter = (workspace: Workspace) => {
    setActiveWorkspaceId(workspace.id);
    navigate(workspaceDestination('/projects', null, workspace.id));
  };
  return (
    <ChooserFrame>
      <AuthRowList label="Your workspaces">
        {workspaces.map((workspace) => (
          <AuthRow
            key={workspace.id}
            lead={<BrandMark name={workspace.name} placement="header" />}
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
    <AuthShell mainLabel="Choose a workspace" barEnd={<UserMenuTrigger presenter="compact" />}>
      <AuthCard title="Choose a workspace" sub="You can switch between workspaces at any time.">
        {children}
      </AuthCard>
    </AuthShell>
  );
}

/** Whether entering this workspace will open it, as its access says now. */
function AccessBadge({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const { data } = useQuery(workspaceQueries.access(workspaceId));
  if (!data) return null;
  switch (data.status) {
    case 'active':
      return null;
    case 'trial_active':
      return (
        <Badge variant="status" value="info">
          Trial until <DisplayTime value={data.expires_at} dateOnly />
        </Badge>
      );
    case 'trial_expired':
      return (
        <Badge variant="status" value="warning">
          Trial ended
        </Badge>
      );
    case 'subscription_lapsed':
      return (
        <Badge variant="status" value="warning">
          Plan ended
        </Badge>
      );
    case 'access_unresolved':
      return (
        <Badge variant="status" value="danger">
          Access unavailable
        </Badge>
      );
    default: {
      const _exhaustive: never = data.status;
      return _exhaustive;
    }
  }
}
