import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { emitResize } from '@/test/resize-observer';

import { SidebarNavGroup, SidebarScrollList } from './sidebar';

function setHeights(node: HTMLElement, heights: { scroll: number; client: number }) {
  Object.defineProperty(node, 'scrollHeight', { configurable: true, value: heights.scroll });
  Object.defineProperty(node, 'clientHeight', { configurable: true, value: heights.client });
}

describe('SidebarScrollList', () => {
  it('fades its bottom when a group grows taller than the list, without a scroll event', () => {
    const { container } = render(
      <SidebarScrollList label="Pages" revealKey="/projects">
        <SidebarNavGroup title="Track">
          <li>Prompts</li>
        </SidebarNavGroup>
      </SidebarScrollList>,
    );
    const list = container.querySelector<HTMLElement>('[data-sidebar-scroll]')!;
    const group = list.querySelector('nav')!.firstElementChild!;
    expect(list.dataset.fadeBottom).toBeUndefined();

    // Within the 1px tolerance nothing is hidden.
    setHeights(list, { scroll: 401, client: 400 });
    act(() => emitResize(group));
    expect(list.dataset.fadeBottom).toBeUndefined();

    setHeights(list, { scroll: 480, client: 400 });
    act(() => emitResize(group));

    expect(list.dataset.fadeBottom).toBe('true');
    expect(list.dataset.fadeTop).toBeUndefined();
  });
});
