import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { AiInstructionsPage, EntityMapPage } from './ai-reference';

describe('Company references', () => {
  it.each([
    ['AI Instructions', AiInstructionsPage],
    ['Entity Map', EntityMapPage],
  ] as const)('keeps %s navigation and entity relationships resolvable', (title, Page) => {
    render(<Page />);
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: title })).toBeVisible();
    const navigation = within(main).getByRole('navigation', { name: 'Company references' });
    expect(within(navigation).getByRole('link', { name: title })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const fragmentLinks = within(main)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('#'));
    expect(fragmentLinks.length).toBeGreaterThan(0);
    for (const link of fragmentLinks) {
      const id = link.getAttribute('href')!.slice(1);
      const target = document.getElementById(id);
      expect(target, `${link.textContent} points at #${id}`).not.toBeNull();
      expect(main.contains(target)).toBe(true);
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    }
  });
});
