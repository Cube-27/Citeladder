import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { choiceFilter } from './all-filters';
import { AllFiltersMenu, keptFilterCount } from './filter-bar';

const PROMPTS = Array.from({ length: 12 }, (_, index) => ({
  value: `p${index + 1}`,
  label: `Prompt number ${index + 1}`,
}));

function Page() {
  const [surface, setSurface] = useState<'all' | 'chatgpt' | 'gemini'>('all');
  const [prompt, setPrompt] = useState('every');
  return (
    <>
      <AllFiltersMenu
        filters={[
          choiceFilter({
            id: 'surface',
            label: 'Surface',
            value: surface,
            defaultValue: 'all',
            groups: [
              { options: [{ value: 'all', label: 'All surfaces' }] },
              {
                label: 'Answer engines',
                options: [
                  { value: 'chatgpt', label: 'ChatGPT' },
                  { value: 'gemini', label: 'Gemini' },
                ],
              },
            ],
            onChange: setSurface,
          }),
          choiceFilter({
            id: 'prompt',
            label: 'Prompt',
            value: prompt,
            defaultValue: 'every',
            groups: [{ options: [{ value: 'every', label: 'Every prompt' }, ...PROMPTS] }],
            onChange: setPrompt,
          }),
        ]}
      />
      <output data-testid="selection">{`${surface} ${prompt}`}</output>
    </>
  );
}

describe('AllFiltersMenu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists each filter with its value, checks the selected option and counts what is set', async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole('button', { name: 'All filters' }));
    const [surface, prompt, ...rest] = screen.getAllByRole('menuitem');
    expect(surface).toHaveAccessibleName('Surface: All surfaces');
    expect(prompt).toHaveAccessibleName('Prompt: Every prompt');
    expect(rest).toHaveLength(0);

    await user.click(screen.getByRole('menuitem', { name: 'Surface: All surfaces' }));
    expect(screen.getByRole('menuitemradio', { name: 'All surfaces' })).toBeChecked();
    await user.keyboard('{ArrowRight}{ArrowDown}{ArrowDown}{Enter}');

    expect(screen.getByTestId('selection')).toHaveTextContent('gemini every');
    expect(screen.getByRole('button', { name: 'All filters (1)' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'All filters (1)' }));
    const set = screen.getByRole('menuitem', { name: 'Surface: Gemini' });
    set.focus();
    await user.keyboard('{ArrowRight}');
    (await screen.findByRole('menuitem', { name: 'Reset to all surfaces' })).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('selection')).toHaveTextContent('all every');
  });

  it('searches a long list and picks from it with the keyboard alone', async () => {
    const user = userEvent.setup();
    render(<Page />);
    screen.getByRole('button', { name: 'All filters' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}');

    const search = screen.getByRole('searchbox', { name: 'Search prompt' });
    expect(search).toHaveFocus();
    await user.keyboard('number 1');
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'Prompt number 1',
      'Prompt number 10',
      'Prompt number 11',
      'Prompt number 12',
    ]);
    await user.keyboard('1{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Prompt number 11' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(search).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByTestId('selection')).toHaveTextContent('all p11');
  });

  it('types into a custom filter field opened with the keyboard alone', async () => {
    function FolderPage() {
      const [folder, setFolder] = useState('');
      return (
        <>
          <AllFiltersMenu
            filters={[
              {
                kind: 'custom',
                id: 'folder',
                label: 'Folder',
                valueLabel: folder || 'Any folder',
                isDefault: !folder,
                defaultLabel: 'Any folder',
                reset: () => setFolder(''),
                content: (
                  <input
                    aria-label="Folder"
                    value={folder}
                    onChange={(event) => setFolder(event.target.value)}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                ),
              },
            ]}
          />
          <output data-testid="folder">{folder}</output>
        </>
      );
    }
    const user = userEvent.setup();
    render(<FolderPage />);
    screen.getByRole('button', { name: 'All filters' }).focus();
    await user.keyboard('{Enter}{ArrowDown}{ArrowRight}');

    expect(screen.getByRole('textbox', { name: 'Folder' })).toHaveFocus();
    await user.keyboard('/blog');
    expect(screen.getByTestId('folder')).toHaveTextContent('/blog');
    expect(screen.getByRole('menuitem', { name: /^Folder/ })).toHaveTextContent('/blog');
  });

  it('on a phone opens a filter in the menu itself, with a way back to the list', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 639px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole('button', { name: 'All filters' }));
    await user.click(screen.getByRole('menuitem', { name: 'Surface: All surfaces' }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'All surfaces',
      'ChatGPT',
      'Gemini',
    ]);

    await user.click(screen.getByRole('menuitem', { name: 'All filters' }));
    expect(screen.getByRole('menuitem', { name: 'Prompt: Every prompt' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Surface: All surfaces' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'ChatGPT' }));
    expect(screen.getByTestId('selection')).toHaveTextContent('chatgpt every');
  });

  it('draws nothing for a page with no filters', () => {
    render(
      <>
        <AllFiltersMenu filters={[]} />
        <button type="button">Other</button>
      </>,
    );
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Other']);
  });
});

const base = { gap: 8, trailing: 0, menu: 90, menuAlways: false, values: [] };

describe('keptFilterCount', () => {
  it.each([
    ['keeps every chip while they fit', { widths: [100, 100, 100], available: 316 }, 3],
    ['folds the overflow and reserves the menu', { widths: [100, 100, 100], available: 300 }, 1],
    ['folds every chip when only the menu fits', { widths: [100, 100], available: 120 }, 0],
    ['keeps chips that have not been measured', { widths: [0, 0, 0], available: 0 }, 3],
    [
      'keeps chips in a row with no width yet',
      { widths: [0, 0], available: 0, menuAlways: true },
      2,
    ],
  ])('%s', (_name, input, kept) => {
    expect(keptFilterCount({ ...base, ...input })).toBe(kept);
  });

  it('charges a folded filter its value chip only while it stays folded', () => {
    const fit = { ...base, widths: [100, 100, 100], values: [0, 0, 100], trailing: 60 };
    expect(keptFilterCount({ ...fit, available: 384 })).toBe(3);
    expect(keptFilterCount({ ...fit, available: 383 })).toBe(1);
  });

  it('reserves an always-present menu and the trailing chips before keeping a chip', () => {
    const widths = [100, 100];
    expect(keptFilterCount({ ...base, widths, available: 208 })).toBe(2);
    expect(keptFilterCount({ ...base, widths, available: 208, menuAlways: true })).toBe(1);
    expect(
      keptFilterCount({ ...base, widths, available: 306, menuAlways: true, trailing: 60 }),
    ).toBe(1);
  });
});
