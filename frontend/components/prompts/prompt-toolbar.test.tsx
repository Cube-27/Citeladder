import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vite-plus/test';

import { emptyFilters } from '@/lib/prompts/filter';

import { PromptFilterControls } from './prompt-toolbar';

describe('PromptFilterControls', () => {
  it('keeps search controlled and lets the reader clear it', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [search, setSearch] = useState('citation');
      return (
        <PromptFilterControls
          search={search}
          onSearchChange={setSearch}
          filters={emptyFilters}
          onFiltersChange={() => undefined}
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
});
