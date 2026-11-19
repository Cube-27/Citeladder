import { renderWithProviders as render } from '@/test/render';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOKEN = 'one-time-invitation-token';

const { selectWorkspace, acceptInvitation, searchParams } = vi.hoisted(() => ({
  selectWorkspace: vi.fn(),
  acceptInvitation: vi.fn(),
  searchParams: new URLSearchParams(),
}));

function renderInvitation() {
  return render(<AcceptInvitationScreen />, {
    initialEntries: [`/invitations/accept?${searchParams}`],
  });
}

vi.mock('@/lib/navigation/project-destination', () => ({
  useSelectWorkspace: () => selectWorkspace,
}));

// The transport is replaced on the module's own client object, so the real
// mutation descriptor (and the refresh it carries) runs against it.
vi.mock('@/lib/api/workspaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/workspaces')>();
  Object.assign(actual.workspacesApi, { acceptInvitation });
  return actual;
});

import { ApiError } from '@/lib/api/errors';

import { AcceptInvitationScreen } from './accept-invitation-screen';

describe('AcceptInvitationScreen', () => {
  beforeEach(() => {
    selectWorkspace.mockClear();
    acceptInvitation.mockReset();
    searchParams.forEach((_value, key) => searchParams.delete(key));
    searchParams.set('token', TOKEN);
  });

  it('accepts the token once and hands the workspace to the shared owner', async () => {
    acceptInvitation.mockResolvedValue({ id: WORKSPACE, name: 'Host', role: 'member' });
    const { rerender } = renderInvitation();
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith(TOKEN));
    // A re-render must not re-post a single-use credential.
    rerender(<AcceptInvitationScreen />);
    expect(acceptInvitation).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(selectWorkspace).toHaveBeenCalledWith(WORKSPACE, '/projects'));
    // The destination is named explicitly and carries NO token: the shared
    // navigation owner is what strips it, and this is the screen that proves
    // the one-time credential never reaches the next URL or the history entry.
    const [, destination] = selectWorkspace.mock.calls[0]!;
    expect(destination).toBe('/projects');
    expect(destination).not.toContain(TOKEN);
  });

  it('does not post anything when the link carries no token', () => {
    searchParams.delete('token');
    renderInvitation();

    expect(acceptInvitation).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { level: 1, name: 'This invitation link is incomplete' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Go to your workspace' })).toBeVisible();
  });

  it('reports a refused invitation in a sentence, with its code only as the reference', async () => {
    acceptInvitation.mockRejectedValue(
      new ApiError('invitation_invalid', 400, '', 'req-1', {
        code: 'workspace_invitation_invalid',
      }),
    );
    renderInvitation();

    // The title says what happened; the code is reference text, never the headline.
    await screen.findByRole('heading', { level: 1, name: "This invitation can't be used" });
    expect(screen.queryByRole('heading', { name: 'Joining workspace' })).toBeNull();
    expect(screen.getByText(/Ask for a new link\./u)).toBeVisible();
    expect(screen.getByText('Reference: workspace_invitation_invalid · req-1')).toBeInTheDocument();
    expect(screen.queryByText('invitation_invalid')).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to your workspace' })).toBeVisible();
    expect(selectWorkspace).not.toHaveBeenCalled();
  });
});
