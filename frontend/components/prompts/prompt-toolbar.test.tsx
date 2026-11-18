import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vite-plus/test';

import { emptyFilters } from '@/lib/prompts/filter';

import { FilterBar } from '@/components/ui/filter-bar';
import { chooseFilterOption, openFilterRow } from '@/test/all-filters';

import { promptFilterControls } from './prompt-toolbar';

describe('promptFilterControls', () => {
  it('keeps search controlled and lets the reader clear it', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [search, setSearch] = useState('citation');
      return (
        <FilterBar
          {...promptFilterControls({
            status: {
              value: 'active',
              counts: { active: 0, archived: 0 },
              onChange: () => undefined,
            },
            search,
            onSearchChange: setSearch,
            filters: emptyFilters,
            onFiltersChange: () => undefined,
          })}
        />
      );
    }

    render(<Harness />);
    const search = screen.getByRole('searchbox', { name: 'Search prompts' });
    expect(search).toHaveValue('citation');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search).toHaveValue('');
    await user.type(search, 'brand');
    expect(search).toHaveValue('brand');
  });

  it('switches between active and archived prompts, each with its count', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [status, setStatus] = useState<'active' | 'archived'>('active');
      return (
        <FilterBar
          {...promptFilterControls({
            status: { value: status, counts: { active: 12, archived: 3 }, onChange: setStatus },
            search: '',
            onSearchChange: () => undefined,
            filters: emptyFilters,
            onFiltersChange: () => undefined,
          })}
        />
      );
    }

    render(<Harness />);
    // jsdom drops the space the browser reads between label and count.
    const archived = screen.getByRole('radio', { name: /^Archived\s*\(3\)$/ });
    const active = screen.getByRole('radio', { name: /^Active\s*\(12\)$/ });
    expect(active).toBeChecked();
    await user.click(archived);
    expect(archived).toBeChecked();
    expect(active).not.toBeChecked();
  });
});

describe('promptFilterControls filters', () => {
  it('offers Enabled and Branded as one choice each, marking a chosen one, and clears both at once', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [filters, setFilters] = useState(emptyFilters);
      return (
        <FilterBar
          {...promptFilterControls({
            status: { value: 'active', counts: { active: 1, archived: 0 }, onChange: () => {} },
            search: '',
            onSearchChange: () => undefined,
            filters,
            onFiltersChange: setFilters,
          })}
        />
      );
    }

    render(<Harness />);
    // Branded is the row's tag chip; Enabled lives in Filters.
    await chooseFilterOption(user, 'Branded', 'Branded only');
    expect(await openFilterRow(user, 'Branded', 'Branded only')).toHaveAttribute('data-active');
    expect(await openFilterRow(user, 'Enabled', 'All prompts')).toBeVisible();
    await user.keyboard('{Escape}');
    await chooseFilterOption(user, 'Enabled', 'Disabled only');
    expect(screen.getByRole('button', { name: 'Remove Enabled filter' })).toBeVisible();

    // Both resets land, though each patches the filters in the same tick.
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: 'Branded: All prompts' })).not.toHaveAttribute(
      'data-active',
    );
    expect(screen.queryByRole('button', { name: 'Remove Enabled filter' })).toBeNull();
  });
});
