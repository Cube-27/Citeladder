import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { MemoryRouter } from 'react-router-dom';

import { TooltipProvider } from '@/components/ui/tooltip';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({
    activeWorkspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }),
}));

import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

import { createAppQueryClient } from '@/lib/api/query-client';
import { THEME_STORAGE_KEY } from '@/lib/theme/theme';

import { UserMenuController, UserMenuTrigger } from './user-menu';

function renderMenu(compact = false) {
  return render(
    <MemoryRouter initialEntries={['/visibility']}>
      <QueryClientProvider client={createAppQueryClient()}>
        <TooltipProvider>
          <UserMenuController>
            <UserMenuTrigger presenter={compact ? 'compact' : 'sidebar'} />
          </UserMenuController>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderSplitMenu() {
  return render(
    <MemoryRouter initialEntries={['/visibility']}>
      <QueryClientProvider client={createAppQueryClient()}>
        <TooltipProvider>
          <UserMenuController>
            <>
              <UserMenuTrigger presenter="sidebar" />
              <UserMenuTrigger presenter="compact" />
            </>
          </UserMenuController>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('UserMenu', () => {
  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    clearSession.mockClear();
    logoutMock.mockReset().mockResolvedValue(undefined);
  });

  it('shows Settings, Billing, MCP docs, and the tour replay above Sign out', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /test\.user@example\.test/i }));

    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    const labels = items.map((item) => item.textContent ?? '');

    const settingsIndex = labels.findIndex((label) => /settings/i.test(label));
    const billingIndex = labels.findIndex((label) => /^billing$/i.test(label));
    const mcpIndex = labels.findIndex((label) => /^mcp$/i.test(label));
    const signOutIndex = labels.findIndex((label) => /sign out/i.test(label));

    // Order: Settings → Billing → MCP → Sign out.
    expect(settingsIndex).toBeGreaterThanOrEqual(0);
    expect(billingIndex).toBe(settingsIndex + 1);
    expect(mcpIndex).toBe(billingIndex + 1);
    expect(signOutIndex).toBe(mcpIndex + 1);

    // asChild renders the menuitem as the Link anchor itself.
    expect(items[settingsIndex]).toHaveAttribute('href', `/settings?workspace=${WORKSPACE}`);
    expect(items[billingIndex]).toHaveAttribute('href', `/billing?workspace=${WORKSPACE}`);
    expect(items[mcpIndex]).toHaveAttribute('href', '/docs/mcp');
    expect(items[mcpIndex]).toHaveAttribute('target', '_blank');
  });

  it('switches the app to dark and back, remembering the choice on this device', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /test\.user@example\.test/i }));
    const toggle = await screen.findByRole('menuitemcheckbox', { name: /dark theme/i });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    // The menu stays open so the reader can flip straight back.
    expect(toggle).toBeChecked();

    await user.click(toggle);
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(toggle).not.toBeChecked();
  });

  it('keeps settings and sign out reachable from the compact mobile trigger', async () => {
    const user = userEvent.setup();
    renderMenu(true);

    await user.click(screen.getByRole('button', { name: /account menu/i }));

    expect(await screen.findByRole('menuitem', { name: /settings/i })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeVisible();
  });

  it('shares one logout controller and restores focus to the actual split trigger', async () => {
    const user = userEvent.setup();
    renderSplitMenu();

    const triggers = screen.getAllByRole('button');
    expect(triggers).toHaveLength(2);
    const [desktopTrigger, compactTrigger] = triggers;

    await user.click(compactTrigger);
    expect(await screen.findByRole('menu')).toBeVisible();
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(compactTrigger).toHaveFocus());

    await user.click(desktopTrigger);
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }));
    expect(logoutMock).toHaveBeenCalledOnce();
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
