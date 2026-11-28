import { Link, useLocation } from 'react-router-dom';

import { AgentNav, AgentRail } from '@/components/agent/agent-nav';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  SidebarFrame,
  SidebarIdentButton,
  SidebarMarkPlaceholder,
  SidebarRailList,
} from '@/components/ui/sidebar';
import { Tooltip } from '@/components/ui/tooltip';
import { Settings } from '@/lib/icons';
import { navigationMode } from '@/lib/navigation/app-routes';
import { scopedNavigationDestination } from '@/lib/navigation/project-destination';
import { useNavScope } from '@/lib/project/project-context';
import { useSidebarCollapsed } from '@/lib/sidebar-width';

import { ModeSwitch } from './mode-switch';
import { ProjectSwitcher } from './project-switcher';
import { DashboardNav, DashboardRail, SidebarFootNav } from './sidebar-nav';
import { UserMenuTrigger } from './user-menu';

export function AppSidebar({
  inDrawer = false,
  pending = false,
}: Readonly<{ inDrawer?: boolean; pending?: boolean }>) {
  const collapsed = useSidebarCollapsed();
  const rail = collapsed && !inDrawer;
  const mode = navigationMode(useLocation().pathname ?? '');
  let nav = mode === 'agent' ? <AgentNav /> : <DashboardNav />;
  if (rail)
    nav = (
      <SidebarRailList label={mode === 'agent' ? 'Agent' : 'Dashboard'}>
        {mode === 'agent' ? <AgentRail /> : <DashboardRail />}
      </SidebarRailList>
    );
  return (
    <SidebarFrame
      ident={
        <>
          <div className="min-w-0 flex-1">
            {pending ? <IdentPlaceholder /> : <ProjectSwitcher />}
          </div>
          {rail ? null : <SettingsLink />}
        </>
      }
      mode={<ModeSwitch rail={rail} />}
      nav={nav}
      foot={<SidebarFootNav rail={rail} />}
      account={
        <div className="labelled:items-stretch flex min-w-0 flex-col items-center">
          {pending ? (
            <IdentPlaceholder />
          ) : (
            <UserMenuTrigger presenter={inDrawer ? 'drawer' : 'sidebar'} />
          )}
        </div>
      }
    />
  );
}

function IdentPlaceholder() {
  return <SidebarIdentButton pending tabIndex={-1} title="" lead={<SidebarMarkPlaceholder />} />;
}

function SettingsLink() {
  const { activeProjectId, activeWorkspaceId } = useNavScope();
  const to = scopedNavigationDestination(
    '/settings',
    'workspace',
    activeProjectId,
    activeWorkspaceId,
  );
  return (
    <Tooltip content="Settings" describe={false}>
      <Button variant="quiet" asChild shape="icon" box="fixed">
        <Link to={to} aria-label="Settings">
          <Icon icon={Settings} />
        </Link>
      </Button>
    </Tooltip>
  );
}
