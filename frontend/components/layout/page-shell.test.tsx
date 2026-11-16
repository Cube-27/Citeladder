import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vite-plus/test';

import { choiceFilter } from '@/components/ui/all-filters';
import { TabsRoot } from '@/components/ui/tabs';
import { ListScreen, RouteLoadingScreen } from './page-shell';

describe('RouteLoadingScreen', () => {
  it.each([
    {
      path: '/visibility',
      title: 'AI Visibility',
      tabs: ['Trends', 'Sources', 'Perception', 'Ads', 'Query fanouts'],
      filters: true,
      shapes: ['figures', 'chart'],
    },
    {
      path: '/site/crawls',
      title: 'Website',
      tabs: ['Overview', 'Pages', 'Architecture', 'AEO readiness', 'Internal links', 'Changes'],
      filters: false,
      shapes: ['figures', 'table'],
    },
    { path: '/issues', title: 'Issues', tabs: [], filters: true, shapes: ['table'] },
    { path: '/agent/chats/1', title: 'Chat', tabs: [], filters: false, shapes: ['thread'] },
    { path: '/pricing', title: 'Pricing', tabs: [], filters: false, shapes: ['card', 'card'] },
  ])('draws $path in its loaded frame', ({ path, title, tabs, filters, shapes }) => {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <RouteLoadingScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    const held = container.querySelector('[data-held-tabs]');
    expect([...(held?.children ?? [])].map((tab) => tab.textContent)).toEqual(tabs);
    if (held) expect(held).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(container.querySelector('[data-page-band="filters"]') !== null).toBe(filters);
    const drawn = [...container.querySelectorAll<HTMLElement>('[data-loading-shape]')];
    expect(drawn.map((node) => node.dataset.loadingShape)).toEqual(shapes);
  });
});

describe('ListScreen', () => {
  it('draws the header, then the controls, then the content', () => {
    render(
      <MemoryRouter initialEntries={['/prompts']}>
        <ListScreen
          actions={<button type="button">Add prompts</button>}
          controls={{ actions: <button type="button">Export</button> }}
        >
          <p>Table</p>
        </ListScreen>
      </MemoryRouter>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Prompts' });
    const filters = screen.getByRole('group', { name: 'Search and filters' });
    const content = screen.getByText('Table');
    expect(title.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(filters.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByRole('button', { name: 'Add prompts' })).toBeInTheDocument();
  });

  it('stacks the masthead, the page tabs band, the filter bar band, then the content', () => {
    const choice = (id: string) =>
      choiceFilter({
        id,
        label: id,
        value: 'all',
        defaultValue: 'all',
        groups: [{ options: [{ value: 'all', label: 'All' }] }],
        onChange: () => undefined,
      });
    render(
      <MemoryRouter initialEntries={['/visibility']}>
        <TabsRoot value="a" onValueChange={() => undefined}>
          <ListScreen
            tabs={{ items: [{ value: 'a', label: 'A' }], ariaLabel: 'Views' }}
            controls={{ filters: [choice('Period'), choice('Engine')] }}
          >
            <p>Table</p>
          </ListScreen>
        </TabsRoot>
      </MemoryRouter>,
    );
    const order = [
      screen.getByRole('heading', { level: 1, name: 'AI Visibility' }),
      screen.getByRole('tablist', { name: 'Views' }).closest('[data-page-band]'),
      screen.getByRole('button', { name: /^All filters/u }).closest('[data-page-band]'),
      screen.getByText('Table'),
    ];
    expect(order.map((node) => node?.getAttribute('data-page-band') ?? node?.tagName)).toEqual([
      'H1',
      'tabs',
      'filters',
      'P',
    ]);
    order.slice(1).forEach((node, index) => {
      expect(order[index]!.compareDocumentPosition(node!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });
});
