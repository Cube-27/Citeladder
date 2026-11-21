import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocsSearchDialog } from './DocsSearchDialog';

const entries = [
  {
    title: 'Sources',
    description: 'Inspect citations',
    group: 'Guides',
    href: '/sources/',
    body: 'Citations for each answer.',
  },
  {
    title: 'Citations in Agent',
    description: 'Cite evidence in a draft',
    group: 'Agent',
    href: '/agent/citations/',
    body: 'Citations in drafts.',
  },
];

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(entries), { status: 200 })),
  );
});
afterEach(() => vi.unstubAllGlobals());

it('announces the highlighted guide as the search field’s active option', async () => {
  const user = userEvent.setup();
  render(<DocsSearchDialog />);
  await user.click(screen.getAllByRole('button', { name: 'Search docs' })[0]!);
  const field = screen.getByRole('combobox', { name: 'Search terms' });
  await user.type(field, 'citations');
  const list = await screen.findByRole('listbox', { name: 'Matching guides' });
  const options = within(list).getAllByRole('option');
  expect(options.map((option) => option.getAttribute('href'))).toEqual([
    '/agent/citations/',
    '/sources/',
  ]);
  expect(field).toHaveAttribute('aria-expanded', 'true');
  expect(field).toHaveAttribute('aria-activedescendant', options[0]!.id);
  expect(options[0]).toHaveAttribute('aria-selected', 'true');

  await user.keyboard('{ArrowDown}');
  expect(field).toHaveAttribute('aria-activedescendant', options[1]!.id);
  expect(options[1]).toHaveAttribute('aria-selected', 'true');
  expect(options[0]).toHaveAttribute('aria-selected', 'false');
  expect(within(list).getByRole('group', { name: 'Guides' })).toContainElement(options[1]!);
});
