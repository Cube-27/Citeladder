import { render } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { ShapeBlocks } from './skeleton-block';

describe('ShapeBlocks', () => {
  it('draws a thread as a user turn, a reply and a user turn, alternating sides', () => {
    const { container } = render(<ShapeBlocks shape={{ kind: 'thread' }} />);
    const blocks = [...container.querySelectorAll('[data-skeleton-block]')];
    expect(blocks.map((block) => block.classList.contains('ms-auto'))).toEqual([true, false, true]);
    expect(blocks.every((block) => block.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
