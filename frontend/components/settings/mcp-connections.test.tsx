import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';

import { mcpConnectionsApi } from '@/lib/api/mcp-connections';
import { renderWithProviders, selectionAs, type TestRole } from '@/test/render';
import type { McpConnection } from '@citeladder/contracts/mcp';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GRANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_GRANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const { list, revoke } = vi.hoisted(() => ({
  list: vi.fn<(workspaceId?: string) => Promise<McpConnection[]>>(),
  revoke: vi.fn<(id: string, workspaceId?: string) => Promise<void>>(),
}));
Object.assign(mcpConnectionsApi, { list, revoke });

import { McpConnections } from './mcp-connections';

const claude: McpConnection = {
  id: GRANT,
  client_name: 'Claude',
  workspaces: [
    { id: WORKSPACE, name: 'Acme' },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Beta' },
  ],
  user_email: null,
  created_at: '2026-10-01T12:00:00Z',
  last_used_at: null,
  requires_consent: false,
};

function renderTab(role: TestRole = 'member') {
  return renderWithProviders(<McpConnections />, { projectSelection: selectionAs(role) });
}

beforeEach(() => {
  list.mockReset();
  revoke.mockReset().mockResolvedValue(undefined);
});

it('leads with the connect strip and shows one empty connections box', async () => {
  list.mockResolvedValue([]);
  renderTab('admin');
  expect(screen.getByRole('link', { name: 'Connect to Claude' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'No connections yet' })).toBeVisible();
  expect(list.mock.calls.map(([id]) => id)).toEqual([undefined, WORKSPACE]);
  expect(screen.getAllByRole('heading', { name: 'Connections' })).toHaveLength(1);
});

it('lays a connection out in columns and revokes it only after confirmation', async () => {
  const user = userEvent.setup();
  list.mockResolvedValue([claude]);
  renderTab();
  const row = (await screen.findByText(/name not verified/u)).closest('tr');
  expect(row).toHaveTextContent('Claude · name not verified' + 'Oct 1, 2026' + 'Not used yet');
  expect(row?.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  expect(list.mock.calls.map(([id]) => id)).toEqual([undefined]);

  await user.click(within(row!).getByRole('button', { name: 'Revoke Claude' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Revoke Claude?' });
  expect(revoke).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
  expect(revoke).toHaveBeenCalledWith(GRANT, undefined);
});

it("shows an Owner/Admin their own and members' connections once, each with its own action", async () => {
  const user = userEvent.setup();
  const anas = {
    ...claude,
    id: OTHER_GRANT,
    workspaces: [{ id: WORKSPACE, name: 'Acme' }],
    user_email: 'ana@example.test',
  };
  list.mockImplementation(async (workspaceId) =>
    workspaceId ? [{ ...claude, user_email: 'me@example.test' }, anas] : [claude],
  );
  renderTab('owner');
  const member = (await screen.findByText('ana@example.test')).closest('tr')!;
  expect(screen.getAllByRole('row')).toHaveLength(3);
  expect(screen.queryByText('me@example.test')).toBeNull();
  expect(screen.getByRole('button', { name: 'Revoke Claude' })).toBeInTheDocument();

  await user.click(within(member).getByRole('button', { name: /Remove/u }));
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove access' }),
  );
  expect(revoke).toHaveBeenCalledWith(OTHER_GRANT, WORKSPACE);
});
