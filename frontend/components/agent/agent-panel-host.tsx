import { lazy, Suspense, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { isAgentPath } from '@/lib/navigation/app-routes';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MASTHEAD_LABELLED } from '@/components/ui/masthead';
import { Tooltip } from '@/components/ui/tooltip';
import { useAgentPanel } from '@/lib/agent/panel-context';
import { ICONS } from '@/lib/icons';
import { useProjectContext } from '@/lib/project/project-context';

// The panel renders chats (markdown, composer, skills); it stays out of the
// chunk the shell needs before it can paint and loads on first open.
const AgentPanel = lazy(() =>
  import('./agent-panel').then(({ AgentPanel }) => ({ default: AgentPanel })),
);

function usePanelAvailable(): boolean {
  const pathname = useLocation().pathname ?? '';
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  return Boolean(activeProjectId && activeWorkspaceId) && !isAgentPath(pathname);
}

/**
 * "Ask agent", last in the masthead of every page but the Agent's own: it
 * opens the agent panel over the screen. A page rendered outside the shell (a
 * preview, a test) has no panel and so no trigger, and never reads the
 * project context it lacks. It keeps its word at every width (below 900px, in More).
 */
export function AgentPanelTrigger() {
  const panel = useAgentPanel();
  if (!panel) return null;
  return <PanelTrigger open={() => panel.setOpen(true)} />;
}

function PanelTrigger({ open }: Readonly<{ open: () => void }>) {
  const available = usePanelAvailable();
  if (!available) return null;
  return (
    <Tooltip content="Ask the agent about this screen" side="bottom">
      <Button
        variant="secondary"
        aria-haspopup="dialog"
        onClick={open}
        className={MASTHEAD_LABELLED}
      >
        <Icon icon={ICONS.agent} />
        Ask agent
      </Button>
    </Tooltip>
  );
}

/** Mounts the panel once it is first opened, then keeps it for its transitions. */
export function AgentPanelHost() {
  const open = useAgentPanel()?.open ?? false;
  const [opened, setOpened] = useState(open);
  // Adjusted during render, so the first open mounts the panel in one pass.
  if (open && !opened) setOpened(true);
  if (!opened) return null;
  return (
    <Suspense fallback={null}>
      <AgentPanel />
    </Suspense>
  );
}
