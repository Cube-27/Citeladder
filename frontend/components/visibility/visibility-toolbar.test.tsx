import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { renderWithProviders as render } from '@/test/render';

import { VisibilityActions, VisibilityToolbar } from './visibility-toolbar';

function renderToolbar(selectionMode: 'run' | 'range') {
  return render(
    <VisibilityToolbar
      activeTab="trends"
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
    />,
  );
}

const triggerNames = () =>
  within(screen.getByTestId('visibility-toolbar'))
    .getAllByRole('button')
    .map((button) => button.textContent);

describe('VisibilityToolbar', () => {
  it('offers a period and a grouping only while every run in a period is pooled', () => {
    const { unmount } = renderToolbar('run');
    // Beside "Latest run", "Last 90 days" and "Per run" contradicted the selection.
    expect(triggerNames()).toEqual([
      'Select measurement: Latest run',
      'Prompts: Unbranded',
      'Filter by surface: All surfaces',
    ]);
    unmount();

    renderToolbar('range');
    // They come last, so the filters before them keep their places.
    expect(triggerNames()).toEqual([
      'Select measurement: All runs in period',
      'Prompts: Unbranded',
      'Filter by surface: All surfaces',
      'Select date range: Last 90 days',
      'Group by: Per run',
    ]);
  });

  it('prints the filter name beside values that do not say which filter they are', () => {
    renderToolbar('range');
    expect(screen.getByRole('button', { name: 'Prompts: Unbranded' })).toHaveTextContent(
      'Prompts: Unbranded',
    );
    expect(screen.getByRole('button', { name: 'Group by: Per run' })).toHaveTextContent(
      'Group by: Per run',
    );
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
