import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { AiInstructionSections, EntitySections } from './reference-sections';

describe('Company references', () => {
  it.each([
    ['AI Instructions', AiInstructionSections],
    ['Entity Map', EntitySections],
  ] as const)('%s fragment links each resolve to one heading on the page', (_title, Sections) => {
    const { container } = render(<Sections />);
    const fragmentLinks = screen
      .queryAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('#'));
    for (const link of fragmentLinks) {
      const id = link.getAttribute('href')!.slice(1);
      expect(
        container.querySelectorAll(`[id="${id}"]`),
        `${link.textContent} points at #${id}`,
      ).toHaveLength(1);
    }
  });

  it('links an entity relation to that entity’s heading', () => {
    render(<EntitySections />);
    const product = screen.getByRole('heading', { level: 2, name: 'CiteLadder' });
    expect(product).toHaveAttribute('id', 'citeladder');
    const relation = screen
      .getAllByRole('link', { name: 'CiteLadder' })
      .find((link) => link.getAttribute('href') === '#citeladder');
    expect(relation).toBeDefined();
  });
});
