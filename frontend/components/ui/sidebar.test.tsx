import { render } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { SidebarNavGroup, SidebarScrollList } from './sidebar';

describe('SidebarScrollList', () => {
  it('scrolls a current row near the bottom edge clear of it on navigation', () => {
    const list = (key: string) => (
      <SidebarScrollList label="Pages" revealKey={key}>
        <SidebarNavGroup>
          <li>
            <a href="/performance" aria-current={key === '/performance' ? 'page' : undefined}>
              Performance
            </a>
          </li>
        </SidebarNavGroup>
      </SidebarScrollList>
    );
    const { container, rerender } = render(list('/projects'));
    const scroller = container.querySelector<HTMLElement>('[data-sidebar-scroll]')!;
    const row = container.querySelector('a')!;
    let scrollTop = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    scroller.getBoundingClientRect = () => DOMRect.fromRect({ y: 0, height: 400 });
    row.getBoundingClientRect = () => DOMRect.fromRect({ y: 352 - scrollTop, height: 32 });

    rerender(list('/performance'));
    expect(scrollTop).toBe(16);

    rerender(list('/projects'));
    scrollTop = 0;
    scroller.getBoundingClientRect = () => DOMRect.fromRect({ y: 0, height: 60 });
    row.getBoundingClientRect = () => DOMRect.fromRect({ y: 28 - scrollTop, height: 32 });
    rerender(list('/performance'));
    expect(scrollTop).toBe(14);
  });
});
