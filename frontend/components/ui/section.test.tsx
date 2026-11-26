import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from './data-table';
import { FigureStrip } from './figure-strip';
import { Section, SectionBleed } from './section';

const panel = (name: string) => screen.getByRole('region', { name }).dataset.panel;

describe('Section depth', () => {
  it('draws a card only on the page; anything inside a surface is flat', () => {
    render(
      <>
        <Section aria-label="Outer">
          <Section aria-label="Inner" />
          <DataTable label="Nested table" columns={[{ key: 'a', label: 'A' }]} />
        </Section>
        <DataTable label="Page table" columns={[{ key: 'a', label: 'A' }]} />
      </>,
    );
    expect([panel('Outer'), panel('Inner'), panel('Nested table'), panel('Page table')]).toEqual([
      'card',
      'flat',
      'flat',
      'card',
    ]);
  });

  it('wraps a bleed slot or strip in its own card on the page, never inside one', () => {
    const { container } = render(
      <>
        <SectionBleed aria-label="Loose rows">rows</SectionBleed>
        <Section aria-label="Holder">
          <FigureStrip label="Figures" segments={[{ key: 'a', label: 'A', value: '1' }]} />
        </Section>
      </>,
    );
    const owners = [...container.querySelectorAll('[data-bleed]')].map(
      (bleed) => bleed.parentElement?.getAttribute('data-panel') ?? null,
    );
    expect(owners).toEqual(['card', 'card']);
    expect(container.querySelectorAll('[data-panel]')).toHaveLength(2);
  });
});
