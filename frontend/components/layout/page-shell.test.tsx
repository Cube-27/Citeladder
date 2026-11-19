import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vite-plus/test';

import type { PageFrameSlots } from '@/components/templates/page-frame';
import { ReportPage } from '@/components/templates/report-page';
import { Button } from '@/components/ui/button';
import { WorkbenchPage } from '@/components/templates/workbench-page';
import { choiceFilter } from '@/components/ui/all-filters';
import { FilterBar } from '@/components/ui/filter-bar';
import { TabRow, TabsRoot } from '@/components/ui/tabs';
import { RouteLoadingScreen } from './page-shell';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteLoadingScreen />
    </MemoryRouter>,
  );
}

describe('RouteLoadingScreen', () => {
  it('places the Overview’s default widgets as the grid does, each with its body’s shape', () => {
    const { container } = renderAt('/projects');
    const widgets = [...container.querySelectorAll<HTMLElement>('[data-loading-widget]')];
    expect(widgets.map((widget) => widget.dataset.loadingWidget)).toEqual([
      'project_state',
      'movement',
      'next_action',
      'missing_prompts',
      'ranked_actions',
      'company_facts',
    ]);
    // Half widgets pair up in a row's grid; a full widget takes a row alone.
    expect(widgets.map((widget) => widget.parentElement?.hasAttribute('data-app-grid'))).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
    // Project state's four figures, owned citation rate the fourth.
    expect(widgets[0]?.querySelectorAll('[data-figure-cell]')).toHaveLength(4);
  });

  it('draws a chat as its thread over the docked composer, never as cards', () => {
    const { container } = renderAt('/agent/chats/1');
    expect(screen.getByRole('heading', { level: 1, name: 'Chat' })).toBeInTheDocument();
    expect(container.querySelector('[data-thread] [data-skeleton="thread"]')).not.toBeNull();
    expect(container.querySelector('.shadow-pop')).not.toBeNull();
    expect(container.querySelector('[data-loading-shape]')).toBeNull();
  });

  it.each([
    {
      path: '/visibility',
      title: 'Sources',
      tabs: ['Domains', 'URLs', 'Read, not cited', 'Query fanouts', 'Ads'],
      filters: true,
      shapes: ['table', 'chart'],
    },
    {
      path: '/site/crawls',
      title: 'Site health',
      tabs: ['Overview', 'Pages', 'Architecture', 'AEO readiness', 'Internal links', 'Changes'],
      filters: false,
      shapes: ['figures', 'table'],
    },
    { path: '/issues', title: 'Issues', tabs: [], filters: true, shapes: ['table'] },
    {
      path: '/products/p1',
      title: 'Product',
      tabs: [],
      filters: false,
      shapes: ['facts', 'figures'],
    },
    { path: '/pricing', title: 'Pricing', tabs: [], filters: false, shapes: ['facts'] },
  ])('draws $path in its loaded frame', ({ path, title, tabs, filters, shapes }) => {
    const { container } = renderAt(path);
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

describe('PageFrame', () => {
  it('narrows a reading route’s page and a settings route’s further, unless a workbench fills it', () => {
    const widthAt = (path: string, page: ReactNode) => {
      const { container, unmount } = render(
        <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>,
      );
      const frame = container.querySelector('[data-masthead]')?.closest('[data-page-width]');
      const width = frame?.getAttribute('data-page-width');
      unmount();
      return width;
    };
    const report = <ReportPage>body</ReportPage>;
    expect([
      widthAt('/settings', report),
      widthAt('/actions/a1', report),
      widthAt('/site', report),
      widthAt('/agent/chats/c1', <WorkbenchPage>body</WorkbenchPage>),
      widthAt('/issues', <RouteLoadingScreen />),
    ]).toEqual(['compact', 'narrow', 'full', 'full', 'narrow']);
  });

  it('ends the last strip with the page actions, never the masthead', () => {
    const placed = (slots: Pick<PageFrameSlots, 'tabs' | 'filters'>) => {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/visibility']}>
          <TabsRoot value="a" onValueChange={() => undefined}>
            <ReportPage {...slots} actions={<Button>Export</Button>}>
              body
            </ReportPage>
          </TabsRoot>
        </MemoryRouter>,
      );
      const band = screen
        .getByRole('button', { name: 'Export' })
        .closest('[data-page-band], [data-masthead]');
      unmount();
      return band?.getAttribute('data-page-band') ?? 'masthead';
    };
    const tabs = <TabRow items={[{ value: 'a', label: 'A' }]} ariaLabel="Views" />;
    const filters = <p>Filters</p>;
    expect([placed({ tabs, filters }), placed({ tabs }), placed({ filters }), placed({})]).toEqual([
      'filters',
      'tabs',
      'filters',
      'filters',
    ]);
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
          <ReportPage
            tabs={<TabRow items={[{ value: 'a', label: 'A' }]} ariaLabel="Views" />}
            filters={<FilterBar filters={[choice('Period'), choice('Engine')]} />}
          >
            <p>Table</p>
          </ReportPage>
        </TabsRoot>
      </MemoryRouter>,
    );
    const order = [
      screen.getByRole('heading', { level: 1, name: 'Sources' }),
      screen.getByRole('tablist', { name: 'Views' }).closest('[data-page-band]'),
      screen.getByRole('button', { name: 'Filters' }).closest('[data-page-band]'),
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
