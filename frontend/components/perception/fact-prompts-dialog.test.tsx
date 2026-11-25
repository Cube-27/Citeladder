import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import type { FactCheckPromptList } from '@citeladder/contracts/fact-checking';
import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { projectScope, renderWithProviders } from '@/test/render';

import { FactPromptsDialog } from './fact-prompts-dialog';

const project = makeProject();
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

const list: FactCheckPromptList = {
  prompts: [
    { id: ids[0]!, text: 'Is Acme any good?', topic: 'Brand', checked: true },
    { id: ids[1]!, text: 'Acme vs Rival?', topic: 'Brand', checked: false },
    { id: ids[2]!, text: 'Best CRM tools?', topic: null, checked: false },
  ],
};

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('FactPromptsDialog', () => {
  it('checks a whole topic at once and saves the chosen prompts', async () => {
    const user = userEvent.setup({ delay: null });
    const saved: unknown[] = [];
    const path = `/api/v1/projects/${project.id}/fact-check/prompts`;
    mswServer.use(
      http.get(path, () => HttpResponse.json(list)),
      http.put(path, async ({ request }) => {
        saved.push(await request.json());
        return HttpResponse.json(list);
      }),
    );
    const onClose = vi.fn();
    renderWithProviders(<FactPromptsDialog onClose={onClose} />, {
      projectSelection: projectScope(project),
    });
    const brand = await screen.findByRole('checkbox', { name: 'Brand' });
    expect(brand).toHaveAttribute('aria-checked', 'mixed');
    await user.click(brand);
    await user.click(screen.getByRole('checkbox', { name: 'Is Acme any good?' }));
    await user.click(screen.getByRole('checkbox', { name: 'Best CRM tools?' }));
    await user.click(screen.getByRole('button', { name: 'Save prompts' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saved).toEqual([{ prompt_ids: [ids[1], ids[2]] }]);
  });
});
