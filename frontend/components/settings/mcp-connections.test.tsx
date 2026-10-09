import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';

import { createAppQueryClient } from '@/lib/api/query-client';
import type { McpConnection } from '@citeladder/contracts/mcp';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GRANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const { list, revoke, mayManage } = vi.hoisted(() => ({
  list: vi.fn<(workspaceId?: string) => Promise<McpConnection[]>>(),
  revoke: vi.fn<(id: string, workspaceId?: string) => Promise<void>>(),
  mayManage: { value: false },
}));
vi.mock('@/lib/api/mcp-connections', () => ({ mcpConnectionsApi: { list, revoke } }));
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeWorkspaceId: WORKSPACE }),
  useWorkspaceCapability: () => mayManage.value,
}));

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

function renderTab() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <McpConnections />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mayManage.value = false;
  list.mockReset();
  revoke.mockReset().mockResolvedValue(undefined);
});

it('leads with the connect strip and points an empty list at it', async () => {
  list.mockResolvedValue([]);
  renderTab();
  expect(screen.getByRole('link', { name: 'Connect to Claude' })).toBeInTheDocument();
  expect(
    await screen.findByText('No assistant is connected yet. Use Connect above to add one.'),
  ).toBeInTheDocument();
});

it('describes a connection by name and revokes it only after confirmation', async () => {
  const user = userEvent.setup();
  list.mockResolvedValueOnce([claude]).mockResolvedValue([]);
  renderTab();
  const row = (await screen.findByText('Reads Acme, Beta.')).closest('li');
  expect(row).toHaveTextContent('Claude · name not verified');
  expect(row).toHaveTextContent('Connected Oct 1, 2026 · Not used yet');
  expect(row?.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);

  await user.click(within(row!).getByRole('button', { name: 'Revoke' }));
  const dialog = screen.getByRole('dialog', { name: 'Revoke Claude?' });
  expect(revoke).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
  expect(revoke).toHaveBeenCalledWith(GRANT, undefined);
  expect(
    await screen.findByText('No assistant is connected yet. Use Connect above to add one.'),
  ).toBeInTheDocument();
});

it("shows an Owner/Admin who connected and removes only this workspace's access", async () => {
  const user = userEvent.setup();
  mayManage.value = true;
  list.mockImplementation(async (workspaceId) =>
    workspaceId
      ? [
          {
            ...claude,
            workspaces: [{ id: WORKSPACE, name: 'Acme' }],
            user_email: 'ana@example.test',
            last_used_at: '2026-10-08T09:30:00Z',
          },
        ]
      : [],
  );
  renderTab();
  const heading = await screen.findByRole('heading', {
    name: 'Connections that can read this workspace',
  });
  const section = heading.closest('section')!;
  expect(section).toHaveTextContent('Connected by ana@example.test');
  expect(section).toHaveTextContent('Last used');
  expect(section).not.toHaveTextContent('Not used yet');

  await user.click(within(section).getByRole('button', { name: 'Remove workspace access' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove access' }),
  );
  expect(revoke).toHaveBeenCalledWith(GRANT, WORKSPACE);
});
