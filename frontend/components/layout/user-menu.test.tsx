import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

// Stub next/navigation (Link uses it in jsdom).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/visibility',
}));

const { clearSession, logoutMock } = vi.hoisted(() => ({
  clearSession: vi.fn().mockResolvedValue(undefined),
  logoutMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/auth/session-guard', () => ({
  useSession: () => ({
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'test.user@example.test',
      role: 'user',
      is_active: true,
      created_at: '2026-01-03T00:00:00Z',
      updated_at: '2026-07-14T09:22:00Z',
    },
    clearSession,
  }),
}));

vi.mock('@/lib/api/auth', () => ({
  authApi: { logout: logoutMock },
}));

import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

import { createAppQueryClient } from '@/lib/api/query-client';

import { UserMenu } from './user-menu';

function renderMenu() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <TooltipProvider>
        <UserMenu />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('UserMenu', () => {
  afterEach(() => {
    clearSession.mockClear();
    logoutMock.mockReset().mockResolvedValue(undefined);
  });

  it('shows Settings, MCP docs, and the tour replay above Sign out', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /test\.user@example\.test/i }));

    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    const labels = items.map((item) => item.textContent ?? '');

    const settingsIndex = labels.findIndex((label) => /settings/i.test(label));
    const mcpIndex = labels.findIndex((label) => /^mcp$/i.test(label));
    const replayIndex = labels.findIndex((label) => /replay product tour/i.test(label));
    const signOutIndex = labels.findIndex((label) => /sign out/i.test(label));

    // Order: Settings → MCP → Replay product tour → Sign out.
    expect(settingsIndex).toBeGreaterThanOrEqual(0);
    expect(mcpIndex).toBe(settingsIndex + 1);
    expect(replayIndex).toBe(mcpIndex + 1);
    expect(signOutIndex).toBe(replayIndex + 1);

    // asChild renders the menuitem as the Link anchor itself.
    expect(items[settingsIndex]).toHaveAttribute('href', '/settings');
    expect(items[mcpIndex]).toHaveAttribute('href', '/docs/mcp');
    expect(items[mcpIndex]).toHaveAttribute('target', '_blank');
  });

  it('clears the client session only after the server confirms logout', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /test\.user@example\.test/i }));
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }));

    expect(logoutMock).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(clearSession).toHaveBeenCalledOnce());
  });

  it('keeps the authenticated UI visible and offers a retry when logout fails', async () => {
    logoutMock.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /test\.user@example\.test/i }));
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/session is still active/i);
    expect(clearSession).not.toHaveBeenCalled();
    expect(screen.getAllByText('test.user@example.test')).not.toHaveLength(0);
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeEnabled();
  });
});
