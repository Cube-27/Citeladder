import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { renderWithProviders as render } from '@/test/render';

import { VisibilityToolbar } from './visibility-toolbar';

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
      'Filter by branding: Unbranded',
      'Filter by surface: All surfaces',
    ]);
    unmount();

    renderToolbar('range');
    // They come last, so the filters before them keep their places.
    expect(triggerNames()).toEqual([
      'Select measurement: All runs in period',
      'Filter by branding: Unbranded',
      'Filter by surface: All surfaces',
      'Select date range: Last 90 days',
      'Select granularity: Per run',
    ]);
  });
});
