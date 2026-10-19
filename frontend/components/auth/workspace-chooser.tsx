'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { FlowShell } from '@/components/auth/flow-shell';
import { FlowAccountControls } from '@/components/layout/flow-account-controls';
import { roleLabel } from '@/components/settings/member-roles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { NavRow } from '@/components/ui/list-row';
import { QueryState } from '@/components/ui/query-state';
import { queryKeys } from '@/lib/api/query-keys';
import type { Workspace } from '@/lib/api/types';
import { workspacesApi } from '@/lib/api/workspaces';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { ownsWorkspace, WORKSPACE_SETUP_PATH } from '@/lib/project/bootstrap';
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
  const only = ownsOne && workspaces.length === 1 ? workspaces[0] : undefined;

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
        <p className="flow-help">Your workspaces could not be loaded. Reload to try again.</p>
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
      <Stack as="ul" gap="tight" aria-label="Your workspaces">
        {workspaces.map((workspace) => (
          <li key={workspace.id}>
            <NavRow
              onSelect={() => enter(workspace)}
              trailing={<AccessBadge workspaceId={workspace.id} />}
            >
              <span className="type-body-strong text-foreground truncate">{workspace.name}</span>
              <span className="type-caption">
                {workspace.role === 'owner' ? 'Your workspace' : roleLabel(workspace.role)}
              </span>
            </NavRow>
          </li>
        ))}
      </Stack>
      {ownsOne ? null : (
        <Button asChild variant="secondary" className="w-fit">
          <Link to={WORKSPACE_SETUP_PATH}>
            <Icon icon={Plus} />
            Set up your own workspace
          </Link>
        </Button>
      )}
    </ChooserFrame>
  );
}

function ChooserFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FlowShell mainLabel="Choose a workspace" align="center" trailing={<FlowAccountControls />}>
      <Stack gap="workspace">
        <div className="flow-header">
          <h1 className="flow-title">Choose a workspace</h1>
          <p className="flow-help">You can switch between workspaces at any time.</p>
        </div>
        {children}
      </Stack>
    </FlowShell>
  );
}

/** Whether entering this workspace will open it, as its access says now. */
function AccessBadge({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const { data } = useQuery({
    queryKey: queryKeys.workspaces.access(workspaceId),
    queryFn: ({ signal }) => workspacesApi.access(workspaceId, { signal }),
  });
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
