import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { ApiError } from '@/lib/api/errors';
import { workspacesApi, type WorkspaceMember } from '@/lib/api/workspaces';
import { renderWithProviders, testProjectSelection } from '@/test/render';

import { WorkspacePanel } from './workspace-panel';

vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate: vi.fn() }));

const owner = testProjectSelection().activeWorkspace!;
const admin = {
  ...owner,
  role: 'admin',
  capabilities: owner.capabilities.filter((capability) => capability !== 'transfer_ownership'),
};
const viewer = { ...owner, role: 'viewer', capabilities: ['read'] };

function member(id: string, email: string, role: string, isSelf = false): WorkspaceMember {
  return { id, user_id: id, email, role, is_self: isSelf, created_at: '2026-01-01T00:00:00Z' };
}
const SELF = member('44444444-4444-4444-8444-444444444444', 'me@example.test', 'owner', true);
const ALEX = member('55555555-5555-4555-8555-555555555555', 'alex@example.test', 'member');

function renderPanel(workspace = owner) {
  return renderWithProviders(<WorkspacePanel />, {
    projectSelection: { activeWorkspace: workspace, workspaces: [workspace] },
  });
}

describe('Workspace panel', () => {
  beforeEach(() => {
    vi.spyOn(workspacesApi, 'listMembers').mockResolvedValue([SELF, ALEX]);
    vi.spyOn(workspacesApi, 'listInvitations').mockResolvedValue([
      {
        id: '66666666-6666-4666-8666-666666666666',
        workspace_id: owner.id,
        email: 'sam@example.test',
        role: 'viewer',
        expires_at: '2026-01-08T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('changes a role only after the change is confirmed', async () => {
    const update = vi
      .spyOn(workspacesApi, 'updateMemberRole')
      .mockResolvedValue({ ...ALEX, role: 'admin' });
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('combobox', { name: `Role for ${ALEX.email}` }));
    await user.click(await screen.findByRole('option', { name: 'Admin' }));
    expect(update).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Change role' });
    await user.click(within(dialog).getByRole('button', { name: 'Make Admin' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(owner.id, ALEX.id, 'admin', { workspaceId: owner.id }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lets only the Owner hand over ownership, naming who receives it', async () => {
    const transfer = vi.spyOn(workspacesApi, 'transferOwnership').mockResolvedValue([]);
    const user = userEvent.setup();
    const view = renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Make owner' }));
    const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership' });
    expect(dialog).toHaveTextContent(`${ALEX.email} becomes the owner of ${owner.name}`);
    await user.click(within(dialog).getByRole('button', { name: `Make ${ALEX.email} owner` }));
    await waitFor(() =>
      expect(transfer).toHaveBeenCalledWith(owner.id, ALEX.id, { workspaceId: owner.id }),
    );

    view.unmount();
    renderPanel(admin);
    expect(await screen.findByText(ALEX.email)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Make owner' })).toBeNull();
  });

  it('asks before removing a member or revoking an invitation, and Cancel changes nothing', async () => {
    const remove = vi.spyOn(workspacesApi, 'removeMember').mockResolvedValue(undefined);
    const revoke = vi.spyOn(workspacesApi, 'revokeInvitation').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      await screen.findByRole('button', { name: `Remove ${ALEX.email} from this workspace` }),
    );
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Remove member' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(remove).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Revoke invitation' })).getByRole('button', {
        name: 'Revoke invitation',
      }),
    );
    await waitFor(() => expect(revoke).toHaveBeenCalled());
  });

  it('keeps the address and shows the refusal in the invite dialog', async () => {
    vi.spyOn(workspacesApi, 'inviteMember').mockRejectedValue(
      new ApiError('This person is already a member', 409, '', undefined, { code: 'conflict' }),
    );
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Invite' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite member' });
    await user.type(within(dialog).getByLabelText('Email'), 'alex@example.test{Enter}');

    expect(await within(dialog).findByText('This person is already a member')).toBeVisible();
    expect(within(dialog).getByLabelText('Email')).toHaveValue('alex@example.test');
  });

  it('says when no member matches the search', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(ALEX.email);
    await user.type(screen.getByRole('searchbox', { name: 'Search members' }), 'nobody');
    expect(screen.getByText('No members match “nobody”.')).toBeVisible();
  });

  it('lets a non-owner leave after confirming, and an Owner only through a transfer', async () => {
    const leave = vi.spyOn(workspacesApi, 'leave').mockResolvedValue(undefined);
    const user = userEvent.setup();
    const view = renderPanel(viewer);

    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Leave workspace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave workspace' });
    await user.click(within(dialog).getByRole('button', { name: 'Leave workspace' }));
    await waitFor(() => expect(leave).toHaveBeenCalledWith(owner.id));

    view.unmount();
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Leave workspace' })).toBeNull();
    expect(
      screen.getByText('To leave this workspace, make another member its owner first.'),
    ).toBeVisible();
  });
});
