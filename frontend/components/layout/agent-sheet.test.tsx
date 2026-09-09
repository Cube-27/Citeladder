import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentLauncher, AgentSheet, AgentSheetTrigger } from './agent-sheet';

function Agent() {
  return (
    <>
      <AgentSheetTrigger />
      <AgentSheet />
    </>
  );
}

let activeProject = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
};
let agentEntitled = true;
let entitlementLoading = false;

vi.mock('next/navigation', () => ({
  usePathname: () => '/site',
  useSearchParams: () => new URLSearchParams('start=2026-08-01&end=2026-08-15&tab=pages'),
}));
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProject }),
}));
vi.mock('@/lib/billing/entitlement-context', () => ({
  useEntitlement: () => ({ hasCapability: () => agentEntitled, isLoading: entitlementLoading }),
}));
vi.mock('@/components/agent/growth-agent-workspace', () => ({
  GrowthAgentWorkspace: (props: unknown) => <pre>{JSON.stringify(props)}</pre>,
}));

describe('AgentSheet', () => {
  beforeEach(() => {
    activeProject = {
      id: '11111111-1111-4111-8111-111111111111',
      workspace_id: '22222222-2222-4222-8222-222222222222',
    };
    agentEntitled = true;
    entitlementLoading = false;
  });

  /**
   * Entitlement is a network answer and the sidebar paints before it lands.
   * The trigger holds its slot meanwhile — otherwise the navigation below it
   * sits higher and drops once the answer arrives — but it must not be
   * reachable, because an unresolved entitlement grants nothing.
   */
  it('holds the trigger’s slot while entitlement is unresolved, inert', () => {
    entitlementLoading = true;
    render(<AgentSheetTrigger />);
    // Present in the layout, absent from the accessibility tree and inert.
    const reserved = document.querySelector('[aria-label="Open Growth Agent"]');
    expect(reserved).toBeDisabled();
    expect(reserved).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: 'Open Growth Agent' })).not.toBeInTheDocument();
  });

  it('opens from the top bar with bounded typed route context and returns focus', async () => {
    const user = userEvent.setup();
    render(<Agent />);
    const trigger = screen.getByRole('button', { name: 'Open Growth Agent' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Growth Agent' })).toBeVisible();
    expect(screen.getByText(/"canonicalRoute":"\/site"/)).toBeVisible();
    expect(
      screen.getByText(/"dateRange":\{"start":"2026-08-01","end":"2026-08-15"\}/),
    ).toBeVisible();
    expect(screen.getByText(/"filters":\{"tab":\["pages"\]\}/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close Growth Agent' }));
    expect(trigger).toHaveFocus();
  });

  it('opens from a contextual launcher with a typed preset', async () => {
    const user = userEvent.setup();
    render(
      <>
        <AgentSheet />
        <AgentLauncher taskType="build_roadmap" objective="Prioritize Website evidence">
          Build roadmap
        </AgentLauncher>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Build roadmap' }));
    expect(screen.getByText(/"initialTask":"build_roadmap"/)).toBeVisible();
    expect(screen.getByText(/"initialObjective":"Prioritize Website evidence"/)).toBeVisible();
  });

  it('hides contextual launchers when Growth Agent is unavailable', () => {
    agentEntitled = false;
    render(
      <AgentLauncher taskType="build_roadmap" objective="Prioritize Website evidence">
        Build roadmap
      </AgentLauncher>,
    );
    expect(screen.queryByRole('button', { name: 'Build roadmap' })).not.toBeInTheDocument();
  });

  it('reopens the default trigger with the last contextual task and objective', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Agent />
        <AgentLauncher taskType="build_roadmap" objective="Keep this objective">
          Contextual launch
        </AgentLauncher>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Contextual launch' }));
    expect(screen.getByText(/"initialObjective":"Keep this objective"/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close Growth Agent' }));
    await user.click(screen.getByRole('button', { name: 'Open Growth Agent' }));
    expect(screen.getByText(/"initialTask":"build_roadmap"/)).toBeVisible();
    expect(screen.getByText(/"initialObjective":"Keep this objective"/)).toBeVisible();
  });

  it('closes and clears route context when the active project changes', async () => {
    const user = userEvent.setup();
    const view = render(<Agent />);
    await user.click(screen.getByRole('button', { name: 'Open Growth Agent' }));
    expect(screen.getByRole('dialog', { name: 'Growth Agent' })).toBeVisible();
    activeProject = {
      id: '33333333-3333-4333-8333-333333333333',
      workspace_id: '44444444-4444-4444-8444-444444444444',
    };
    view.rerender(<Agent />);
    expect(screen.queryByRole('dialog', { name: 'Growth Agent' })).not.toBeInTheDocument();
  });
});
