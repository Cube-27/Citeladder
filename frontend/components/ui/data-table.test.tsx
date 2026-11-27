import { fireEvent, render, screen, within } from '@testing-library/react';
import { Inbox } from '@/lib/icons';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it } from 'vite-plus/test';

import { Absence } from './absence';
import { Button } from './button';
import { DataTable } from './data-table';
import { FilterBar } from './filter-bar';

type DataTableProps = ComponentProps<typeof DataTable>;
import { TableActionsCell, TableCell, TableRow, TableSelectCell } from './table';

const PROMPTS = ['Best CRM for startups', 'Cheapest CRM for agencies'];

function SelectablePrompts() {
  const [selected, setSelected] = useState<readonly string[]>([]);
  let all: boolean | 'indeterminate' = false;
  if (selected.length === PROMPTS.length) all = true;
  else if (selected.length > 0) all = 'indeterminate';
  return (
    <DataTable
      title="Suggested prompts"
      columns={[{ key: 'prompt', label: 'Prompt' }]}
      selection={{
        all,
        noun: 'suggested prompts',
        onAllChange: (checked) => setSelected(checked ? PROMPTS : []),
      }}
    >
      {PROMPTS.map((prompt) => (
        <TableRow key={prompt}>
          <TableSelectCell
            label={`Select ${prompt}`}
            checked={selected.includes(prompt)}
            onCheckedChange={(checked) =>
              setSelected((current) =>
                checked ? [...current, prompt] : current.filter((item) => item !== prompt),
              )
            }
          />
          <TableCell>{prompt}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

describe('DataTable', () => {
  it('pins the selection column together with the first', () => {
    const { container } = render(
      <DataTable
        label="Pages"
        columns={[
          { key: 'page', label: 'Page', kind: 'identity' },
          { key: 'visits', label: 'Visits', kind: 'number' },
          { key: 'seen', label: 'Last seen', kind: 'date' },
          { key: 'open', label: 'Open', kind: 'actions' },
        ]}
        selection={{ all: false, noun: 'pages', onAllChange: () => undefined }}
      >
        <TableRow>
          <TableCell>/pricing</TableCell>
          <TableCell>12</TableCell>
          <TableCell>Nov 14, 2026</TableCell>
          <TableCell>Open</TableCell>
        </TableRow>
      </DataTable>,
    );
    const frame = container.querySelector<HTMLElement>('[data-data-table-frame]')!;
    expect(frame).toHaveAttribute('data-pinned', '2');
  });

  it('selects every row from the header box and shows a partial selection as mixed', () => {
    render(<SelectablePrompts />);
    const all = screen.getByRole('checkbox', { name: 'Select all suggested prompts' });

    fireEvent.click(all);
    expect(screen.getByRole('checkbox', { name: 'Select Best CRM for startups' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Select Cheapest CRM for agencies' }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Best CRM for startups' }));
    expect(all).toHaveAttribute('aria-checked', 'mixed');
  });

  it('names the table by its title, with the description and a column caption beside it', () => {
    render(
      <DataTable
        title="AI referral sources"
        description="Shares use all GA4 source-report sessions."
        columns={[
          { key: 'source', label: 'Source' },
          { key: 'comparison', label: 'Sessions', kind: 'number', sublabel: 'Previous period' },
        ]}
      >
        <TableRow>
          <TableCell>ChatGPT</TableCell>
          <TableCell numeric>12</TableCell>
        </TableRow>
      </DataTable>,
    );
    const table = screen.getByRole('table', { name: 'AI referral sources' });
    expect(within(table).getAllByRole('columnheader')[1]).toHaveTextContent(
      'SessionsPrevious period',
    );
    expect(
      within(screen.getByRole('region', { name: 'AI referral sources' })).getByText(
        'Shares use all GA4 source-report sessions.',
      ),
    ).toBeVisible();
  });

  it('holds ten rows of space under a paged table and keeps its empty state inside it', () => {
    const pager = {
      canPrev: false,
      canNext: false,
      onPrev: () => undefined,
      onNext: () => undefined,
      range: { from: 0, to: 0, total: 0, noun: 'signals' },
    };
    const table = (paged: boolean) => (
      <DataTable
        label="Signals"
        columns={[{ key: 'query', label: 'Query' }]}
        pageSize={3}
        pager={paged ? pager : undefined}
        state={{
          kind: 'error',
          error: new Error('offline'),
          fallback: 'The request failed.',
          onRetry: () => undefined,
          title: "Couldn't load signals",
        }}
      />
    );
    const reserved = (root: HTMLElement) =>
      root
        .querySelector<HTMLElement>('[style*="--reserve-rows"]')
        ?.style.getPropertyValue('--reserve-rows');
    const { container, rerender } = render(table(false));
    expect(reserved(container)).toBeUndefined();
    expect(container.querySelector('table')?.closest('[hidden]')).not.toBeNull();

    rerender(table(true));
    expect(reserved(container)).toBe('10');
    expect(screen.getByText("Couldn't load signals")).toBeVisible();
    expect(container.querySelector('table')?.closest('[inert]')).not.toBeNull();
  });

  it('draws the pager only once the rows run past one page, and never blank rows', () => {
    const table = (total: number) => (
      <DataTable
        label="Runs"
        columns={[{ key: 'run', label: 'Run' }]}
        pageSize={10}
        pager={{
          canPrev: false,
          canNext: false,
          onPrev: () => undefined,
          onNext: () => undefined,
          range: { from: 1, to: 1, total, noun: 'runs' },
          pageSize: { value: 10, onChange: () => undefined },
        }}
      >
        <TableRow>
          <TableCell>Run one</TableCell>
        </TableRow>
      </DataTable>
    );
    const { container, rerender } = render(table(1));
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);

    rerender(table(11));
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('keeps the pager for a reader who picked a bigger page, even when no total is known', () => {
    const table = (pageSize: number) => (
      <DataTable
        label="Inventory"
        columns={[{ key: 'url', label: 'URL' }]}
        pageSize={pageSize}
        pager={{
          canPrev: false,
          canNext: false,
          onPrev: () => undefined,
          onNext: () => undefined,
          range: { from: 1, to: 3, noun: 'pages' },
          pageSize: { value: pageSize, onChange: () => undefined },
        }}
      >
        <TableRow>
          <TableCell>/pricing</TableCell>
        </TableRow>
      </DataTable>
    );
    const { rerender } = render(table(10));
    expect(screen.queryByRole('combobox', { name: 'Rows per page for pages' })).toBeNull();

    rerender(table(25));
    expect(screen.getByRole('combobox', { name: 'Rows per page for pages' })).toHaveTextContent(
      '25',
    );
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('gives an empty table over to its empty state, head included, but keeps the head for a filter', () => {
    const table = (state: DataTableProps['state']) => (
      <DataTable
        title="Referrers"
        columns={[
          { key: 'host', label: 'Host' },
          { key: 'sessions', label: 'Sessions', kind: 'number' },
        ]}
        state={state}
      />
    );
    const { rerender } = render(
      table({ kind: 'empty', inline: true, message: 'No referrers in this period.' }),
    );
    expect(screen.getByText('No referrers in this period.')).toBeVisible();
    expect(screen.queryByRole('columnheader')).toBeNull();

    rerender(table({ kind: 'empty', icon: Inbox, heading: 'No referrers yet' }));
    expect(screen.getByRole('heading', { name: 'Referrers' }).tagName).toBe('H2');
    expect(screen.getByRole('heading', { name: 'No referrers yet' }).tagName).toBe('H3');
    expect(screen.queryByRole('columnheader')).toBeNull();

    rerender(table({ kind: 'filtered', onClear: () => undefined }));
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      'Host',
      'Sessions',
    ]);
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  });

  it('keeps rows whose every value is absent, with their actions and the pager', () => {
    render(
      <DataTable
        title="Pages"
        columns={[
          { key: 'page', label: 'Page', kind: 'identity' },
          { key: 'visits', label: 'Visits', kind: 'number' },
          { key: 'actions', label: 'Actions', kind: 'actions' },
        ]}
        pager={{
          range: { from: 1, to: 1, total: 2, noun: 'pages' },
          canPrev: false,
          canNext: true,
          onPrev: () => undefined,
          onNext: () => undefined,
        }}
      >
        <TableRow>
          <TableCell>/pricing</TableCell>
          <TableCell numeric>
            <Absence state="not_measured" />
          </TableCell>
          <TableActionsCell>
            <Button>Open /pricing</Button>
          </TableActionsCell>
        </TableRow>
      </DataTable>,
    );
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      'Page',
      'Visits',
      'Actions',
    ]);
    expect(screen.getByRole('button', { name: 'Open /pricing' })).toBeVisible();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'No measurements yet' })).toBeNull();
  });

  it('loads as rows of blocks under the real head and announces its verb', async () => {
    const { container } = render(
      <DataTable
        label="Runs"
        columns={[
          { key: 'run', label: 'Run' },
          { key: 'prompts', label: 'Prompts', kind: 'number' },
          { key: 'started', label: 'Started', kind: 'date' },
        ]}
        pageSize={4}
        state={{ kind: 'loading', label: 'Loading runs…' }}
      />,
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(container.querySelectorAll('tbody [data-skeleton-block]')).toHaveLength(12);
    expect(await screen.findByRole('status', { name: 'Loading runs…' })).toBeInTheDocument();
  });

  it('cues the edge that hides columns and becomes a tab stop only while the table scrolls sideways', () => {
    const { container } = render(
      <DataTable label="Wide" columns={[{ key: 'url', label: 'URL' }]}>
        <TableRow>
          <TableCell>/pricing</TableCell>
        </TableRow>
      </DataTable>,
    );
    const frame = container.querySelector<HTMLElement>('[data-scroll-content]')!;
    const cue = container.querySelector<HTMLElement>('[data-scroll-frame]')!;
    const fades = () =>
      (['start', 'end'] as const).filter((edge) => cue.hasAttribute(`data-scroll-${edge}`));
    const layout = (scrollWidth: number, scrollLeft: number) => {
      Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 400 });
      Object.defineProperty(frame, 'scrollWidth', { configurable: true, value: scrollWidth });
      Object.defineProperty(frame, 'scrollLeft', { configurable: true, value: scrollLeft });
      fireEvent.scroll(frame);
    };

    layout(400, 0);
    expect(fades()).toEqual([]);
    expect(frame).not.toHaveAttribute('tabindex');
    layout(900, 0);
    expect(fades()).toEqual(['end']);
    expect(frame).toHaveAttribute('tabindex', '0');
    expect(frame).toHaveAttribute('aria-label', 'Wide');
    expect(container.querySelector('[data-scroll-step]')).toBeNull();
    layout(900, 200);
    expect(fades()).toEqual(['end']);
    layout(900, 500);
    expect(fades()).toEqual([]);
  });

  it('announces the filtered result count in a polite live region', () => {
    const { rerender } = render(<FilterBar status="312 prompts" />);
    const count = screen.getByRole('status');
    expect(count).toHaveAttribute('aria-live', 'polite');
    rerender(<FilterBar status="12 prompts" />);
    expect(screen.getByRole('status')).toBe(count);
    expect(count).toHaveTextContent('12 prompts');
  });

  it('keeps a row’s actions together in its trailing cell', () => {
    render(
      <DataTable
        label="Sources"
        columns={[
          { key: 'host', label: 'Host' },
          { key: 'manage', label: 'Manage', width: 'rowActions' },
        ]}
      >
        <TableRow>
          <TableCell>example.com</TableCell>
          <TableActionsCell>
            <Button variant="secondary">Rotate token</Button>
            <Button variant="secondary">Revoke</Button>
          </TableActionsCell>
        </TableRow>
      </DataTable>,
    );
    const [, actions] = within(screen.getByRole('table', { name: 'Sources' })).getAllByRole('cell');
    expect(
      within(actions!)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Rotate token', 'Revoke']);
  });
});
