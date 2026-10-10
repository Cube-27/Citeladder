'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { FlowShell } from '@/components/auth/flow-shell';
import { ThemeSwitch } from '@/components/layout/theme-switch';
import { UserMenuTrigger } from '@/components/layout/user-menu';
import { PageLoading } from '@/components/layout/page-loading';
import { roleLabel } from '@/components/settings/member-roles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { listRowClasses } from '@/components/ui/list-row';
import { Pressable } from '@/components/ui/pressable';
import { queryKeys } from '@/lib/api/query-keys';
import type { Workspace } from '@/lib/api/types';
import { workspacesApi } from '@/lib/api/workspaces';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { WORKSPACE_SETUP_PATH } from '@/lib/project/bootstrap';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';

/**
 * Where a signed-in person goes next: their own workspace (or setting one up
 * when they own none) and every workspace they were invited to. Someone with
 * exactly one destination goes straight there.
 */
export function WorkspaceChooser() {
  const { workspaces, status, setActiveWorkspaceId } = useProjectContext();
  const navigate = useNavigate();
  const ownsWorkspace = workspaces.some((workspace) => workspace.role === 'owner');
  const listed = workspaces.length > 0 || status === 'no_workspace';
  const only = ownsWorkspace && workspaces.length === 1 ? workspaces[0] : undefined;

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
  if (!listed || only || status === 'no_workspace')
    return <PageLoading label="Loading your workspaces…" />;

  const enter = (workspace: Workspace) => {
    setActiveWorkspaceId(workspace.id);
    navigate(workspaceDestination('/projects', null, workspace.id));
  };
  return (
    <ChooserFrame>
      <ul className="grid gap-1" aria-label="Your workspaces">
        {workspaces.map((workspace) => (
          <li key={workspace.id}>
            <Pressable
              className={cn(
                listRowClasses(),
                'flex w-full items-center gap-3 px-3 py-2.5 text-start',
              )}
              onClick={() => enter(workspace)}
            >
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="type-body-strong text-foreground truncate">{workspace.name}</span>
                <span className="type-caption">
                  {workspace.role === 'owner' ? 'Your workspace' : roleLabel(workspace.role)}
                </span>
              </span>
              <AccessBadge workspaceId={workspace.id} />
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            </Pressable>
          </li>
        ))}
      </ul>
      {ownsWorkspace ? null : (
        <Button asChild variant="secondary" className="w-fit">
          <Link to={WORKSPACE_SETUP_PATH}>
            <Plus className="size-4" aria-hidden />
            Set up your own workspace
          </Link>
        </Button>
      )}
    </ChooserFrame>
  );
}

function ChooserFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FlowShell
      mainLabel="Choose a workspace"
      align="center"
      trailing={
        <div className="flex items-center gap-1">
          <ThemeSwitch />
          <UserMenuTrigger presenter="compact" />
        </div>
      }
    >
      <div className="grid gap-5">
        <div className="flow-header">
          <h1 className="flow-title">Choose a workspace</h1>
          <p className="flow-help">You can switch between workspaces at any time.</p>
        </div>
        {children}
      </div>
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
