import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { contentSkillCatalogFixture } from './content-screen.test-fixtures';
import { SkillPicker } from './skill-picker';

describe('SkillPicker', () => {
  it('groups the catalog by channel and reveals formats only from its dropdown', async () => {
    renderWithProviders(
      <SkillPicker
        skills={contentSkillCatalogFixture.skills}
        value="content_page"
        onChange={vi.fn()}
      />,
    );

    const web = screen.getByRole('button', { name: 'Web: Website content page' });
    expect(screen.getByRole('button', { name: 'Social formats' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: /Article/i })).not.toBeInTheDocument();

    await userEvent.click(web);
    expect(screen.getByRole('menuitemradio', { name: /Article/i })).toBeInTheDocument();
  });
});
