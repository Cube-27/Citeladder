import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const push = vi.fn();
const setActiveProjectId = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const projectContext = {
  projects: [
    { id: 'p1', brand_name: 'Acme' },
    { id: 'p2', brand_name: 'Orbit' },
  ],
  activeProjectId: 'p1',
  setActiveProjectId,
};

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => projectContext,
}));

import { CommandPalette } from './command-palette';

/** Opens via the sidebar trigger and returns the user-event instance. */
async function open() {
  const user = userEvent.setup();
  render(<CommandPalette />);
  await user.click(screen.getByRole('button', { name: /search or jump to/i }));
  await screen.findByRole('listbox');
  return user;
}

describe('CommandPalette', () => {
  beforeEach(() => {
    push.mockClear();
    setActiveProjectId.mockClear();
  });

  it('renders the trigger closed, advertising its shortcut', () => {
    render(<CommandPalette />);
    const trigger = screen.getByRole('button', { name: /search or jump to/i });
    expect(trigger).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens on Ctrl+K and closes on a second press', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('lists every nav destination and every project', async () => {
    await open();
    // One from each nav group, plus both projects.
    expect(screen.getByRole('option', { name: /visibility/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /site health/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /acme/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /orbit/i })).toBeInTheDocument();
  });

  it('marks the active project so the current scope is obvious', async () => {
    await open();
    expect(screen.getByRole('option', { name: /acme/i })).toHaveTextContent('Current');
    expect(screen.getByRole('option', { name: /orbit/i })).not.toHaveTextContent('Current');
  });

  it('filters on substring across label and group', async () => {
    const user = await open();
    await user.keyboard('site');
    expect(screen.getByRole('option', { name: /site health/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^visibility/i })).not.toBeInTheDocument();
  });

  it('navigates to the highlighted route on Enter', async () => {
    const user = await open();
    await user.keyboard('issues{Enter}');
    expect(push).toHaveBeenCalledWith('/issues');
  });

  it('switches project rather than navigating', async () => {
    const user = await open();
    await user.keyboard('orbit{Enter}');
    expect(setActiveProjectId).toHaveBeenCalledWith('p2');
    expect(push).not.toHaveBeenCalled();
  });

  it('moves the selection with the arrow keys', async () => {
    const user = await open();
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    // Wraps backwards past the start to the last result.
    await user.keyboard('{ArrowUp}{ArrowUp}');
    const after = screen.getAllByRole('option');
    expect(after[after.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('reports no matches instead of an empty list', async () => {
    const user = await open();
    await user.keyboard('zzzzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/no matches for/i)).toBeInTheDocument();
  });

  it('does not fire a command when nothing matches', async () => {
    const user = await open();
    await user.keyboard('zzzzz{Enter}');
    expect(push).not.toHaveBeenCalled();
    expect(setActiveProjectId).not.toHaveBeenCalled();
  });
});
