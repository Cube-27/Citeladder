import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import { FilterBar } from '@/components/ui/filter-bar';
import type { ProjectMarket } from '@citeladder/contracts/markets';
import type { VisibilityView } from '@/lib/visibility/dashboard';
import { chooseFilterOption } from '@/test/all-filters';
import { renderWithProviders as render } from '@/test/render';

import { VisibilityActions, useVisibilityFilterMenu } from './visibility-toolbar';

type MenuProps = Parameters<typeof useVisibilityFilterMenu>[0];

function Row(props: MenuProps) {
  return <FilterBar filters={useVisibilityFilterMenu(props)} />;
}

function renderRow({
  view = 'insights',
  selectionMode,
  ...overrides
}: Partial<MenuProps> & { view?: VisibilityView; selectionMode: 'run' | 'range' }) {
  return render(
    <Row
      view={view}
      selectionMode={selectionMode}
      onChangeSelectionMode={vi.fn()}
      runs={[]}
      selectedRunId={null}
      onSelectMeasurement={vi.fn()}
      engine="all"
      onChangeEngine={vi.fn()}
      promptOptions={[]}
      promptId={null}
      onChangePrompt={vi.fn()}
      range="90d"
      onChangeRange={vi.fn()}
      granularity="run"
      onChangeGranularity={vi.fn()}
      cohort="core"
      onChangeCohort={vi.fn()}
      {...overrides}
    />,
  );
}

/** The row's own chips, in order, by their accessible names ("Measurement: Latest run"). */
function rowChips(): string[] {
  return screen
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-haspopup') === 'menu')
    .map((button) => button.getAttribute('aria-label') ?? '')
    .filter((name) => !name.startsWith('Filters'));
}

/** Opens Filters and lists its entries, in order, by their accessible names. */
async function filtersMenu(): Promise<string[]> {
  await userEvent.setup().click(screen.getByRole('button', { name: /^Filters/ }));
  return screen.getAllByRole('menuitem').map((item) => item.getAttribute('aria-label') ?? '');
}

const MARKETS: ProjectMarket[] = [
  {
    id: null,
    label: 'United States',
    country_code: 'US',
    language_code: 'en',
    is_default: true,
    created_at: null,
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    label: 'Germany',
    country_code: 'DE',
    language_code: 'de',
    is_default: false,
    created_at: null,
  },
];
const TOPICS = [{ id: 't1', name: 'Pricing' }];

describe('useVisibilityFilterMenu', () => {
  it('offers a period and a grouping only while every run in a period is pooled', () => {
    const { unmount } = renderRow({ selectionMode: 'run' });
    // Beside "Latest run", "Last 90 days" and "Per run" contradicted the selection.
    expect(rowChips()).toEqual([
      'Measurement: Latest run',
      'Surface: All surfaces',
      'Prompts: Unbranded',
    ]);
    unmount();

    renderRow({ selectionMode: 'range' });
    // The pooled period stands beside the measurement, so the window stays in the row.
    expect(rowChips()).toEqual([
      'Measurement: All runs in period',
      'Period: Last 90 days',
      'Surface: All surfaces',
      'Prompts: Unbranded',
      'Group by: Per run',
    ]);
  });

  it('keeps each page’s four icon filters in the row and the rest in Filters', async () => {
    const { unmount } = renderRow({
      selectionMode: 'run',
      markets: MARKETS,
      onChangeMarket: vi.fn(),
      topics: TOPICS,
      topic: 't1',
      onChangeTopic: vi.fn(),
    });
    expect(rowChips()).toEqual([
      'Measurement: Latest run',
      'Surface: All surfaces',
      'Market: United States',
      'Prompts: Unbranded',
    ]);
    // A fifth icon filter waits in Filters; set, it follows as a removable value chip.
    expect(screen.getByRole('button', { name: 'Remove Topic filter' })).toBeVisible();
    expect(await filtersMenu()).toEqual(['Topic: Pricing']);
    unmount();

    renderRow({
      view: 'competitors',
      selectionMode: 'run',
      cohort: 'all',
      markets: MARKETS,
      onChangeMarket: vi.fn(),
      topics: TOPICS,
      onChangeTopic: vi.fn(),
    });
    // Competitors read by topic; the prompt cohort moves behind Filters.
    expect(rowChips()).toEqual([
      'Measurement: Latest run',
      'Surface: All surfaces',
      'Market: United States',
      'Topic: All topics',
    ]);
    expect(screen.getByRole('button', { name: 'Remove Prompts filter' })).toBeVisible();
    expect(await filtersMenu()).toEqual(['Prompts: All prompts']);
  });

  it('lists the prompt and answer outcome in Filters only where answers are shown', async () => {
    renderRow({
      view: 'query-fanout',
      selectionMode: 'run',
      promptOptions: [{ id: 'p1', label: 'Best CRM?' }],
      promptId: 'p1',
      onChangeOutcome: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeVisible();
    // The set prompt follows Filters as a value chip, removable by name.
    expect(screen.getByRole('button', { name: 'Remove Prompt filter' })).toBeVisible();
    expect(await filtersMenu()).toEqual(['Prompt: Best CRM?', 'Answer outcome: All answers']);
  });

  it('names the latest run at the row’s end while the measurement shows only its icon', () => {
    const runs = [
      { id: 'run-2', status: 'completed' as const, label: '2 Nov 2026', completedAt: null },
    ];
    const { unmount } = renderRow({ selectionMode: 'run', runs });
    expect(screen.getByText('Latest run · 2 Nov 2026')).toBeVisible();
    unmount();
    renderRow({ selectionMode: 'run', runs, selectedRunId: 'run-2' });
    expect(screen.queryByText(/Latest run ·/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Measurement: 2 Nov 2026' })).toBeVisible();
  });

  it('pools the period from the measurement chip, and picks a run by id', async () => {
    const user = userEvent.setup();
    const onChangeSelectionMode = vi.fn();
    const onSelectMeasurement = vi.fn();
    renderRow({
      selectionMode: 'run',
      runs: [{ id: 'run-2', status: 'completed', label: '2 Nov 2026', completedAt: null }],
      onChangeSelectionMode,
      onSelectMeasurement,
    });
    await chooseFilterOption(user, 'Measurement', 'All runs in period');
    expect(onChangeSelectionMode.mock.calls).toEqual([['range']]);
    await chooseFilterOption(user, 'Measurement', '2 Nov 2026');
    expect(onSelectMeasurement.mock.calls).toEqual([['run-2']]);
  });
});

describe('VisibilityActions', () => {
  it('links the metrics help to the Visibility guide and offers no export', () => {
    render(<VisibilityActions />);
    expect(screen.getByRole('link', { name: 'About these metrics' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https?:\/\/[^/]+\/visibility\/$/u),
    );
    expect(screen.queryByRole('button', { name: /export/iu })).toBeNull();
  });
});
