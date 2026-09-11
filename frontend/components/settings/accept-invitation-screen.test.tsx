import { renderWithProviders as render } from '@/test/render';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOKEN = 'one-time-invitation-token';

const { push, selectWorkspace, acceptInvitation, searchParams } = vi.hoisted(() => ({
  push: vi.fn(),
  selectWorkspace: vi.fn(),
  acceptInvitation: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/navigation/project-destination', () => ({
  useSelectWorkspace: () => selectWorkspace,
}));

vi.mock('@/lib/api/workspaces', () => ({
  workspacesApi: { acceptInvitation },
}));

import { AcceptInvitationScreen } from './accept-invitation-screen';

describe('AcceptInvitationScreen', () => {
  beforeEach(() => {
    push.mockClear();
    selectWorkspace.mockClear();
    acceptInvitation.mockReset();
    searchParams.forEach((_value, key) => searchParams.delete(key));
    searchParams.set('token', TOKEN);
  });

  it('accepts the token once and hands the workspace to the shared owner', async () => {
    acceptInvitation.mockResolvedValue({ id: WORKSPACE, name: 'Host', role: 'member' });

    const { rerender } = render(<AcceptInvitationScreen />);
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith(TOKEN));
    // A re-render must not re-post a single-use credential.
    rerender(<AcceptInvitationScreen />);
    expect(acceptInvitation).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(selectWorkspace).toHaveBeenCalledWith(WORKSPACE, '/projects'));
    // The destination is named explicitly and carries NO token: the shared
    // navigation owner is what strips it, and this is the screen that proves
    // the one-time credential never reaches the next URL or the history entry.
    const [, destination] = selectWorkspace.mock.calls[0];
    expect(destination).toBe('/projects');
    expect(destination).not.toContain(TOKEN);
  });

  it('does not post anything when the link carries no token', () => {
    searchParams.delete('token');

    render(<AcceptInvitationScreen />);

    expect(acceptInvitation).not.toHaveBeenCalled();
    expect(screen.getByText(/missing its invitation token/i)).toBeInTheDocument();
  });

  it('reports a refused invitation without saying which refusal it was', async () => {
    acceptInvitation.mockRejectedValue(new Error('invitation_invalid'));

    render(<AcceptInvitationScreen />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /go to your workspace/i })).toBeInTheDocument(),
    );
    expect(selectWorkspace).not.toHaveBeenCalled();
  });
});
