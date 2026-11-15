import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';

import { StepChart } from './step-chart';

const rows = (name: string) =>
  within(screen.getByRole('table', { name }))
    .getAllByRole('row')
    .map((row) => row.textContent);

/** The drawn runs of a line: each `M` lifts the pen after a gap or a break. */
const runsOf = (container: HTMLElement, tone = 'you') =>
  (container.querySelector(`[data-trend-line="${tone}"] path`)?.getAttribute('d')?.split('M')
    .length ?? 1) - 1;

describe('StepChart', () => {
  it('tabulates every line and value, naming a missing value rather than zero', () => {
    render(
      <StepChart
        label="Visibility trend"
        name="You"
        data={[
          { label: 'Jun', value: 40 },
          { label: 'Jul', value: null },
        ]}
        series={[{ label: 'Globex', values: [30, 35] }]}
        yFormat={(value) => `${value}%`}
      />,
    );
    expect(rows('Visibility trend')).toEqual([
      'SeriesJunJul',
      'You40%Not measured',
      'Globex30%35%',
    ]);
    expect(
      screen.getByText(
        /^Visibility trend\. You: 40% on Jun to 40% on Jun; Globex: 30% on Jun to 35% on Jul\.$/,
      ),
    ).toBeInTheDocument();
  });

  it('steps between measurements and shows a missing period as a hatched band, never a bridge', () => {
    const { container } = render(
      <StepChart
        label="Mention rate"
        data={[
          { label: 'Jun', value: 40 },
          { label: 'Jul', value: 50 },
          { label: 'Aug', value: null },
          { label: 'Sep', value: 60 },
          { label: 'Oct', value: 70, breakBefore: true },
        ]}
      />,
    );
    const path = container.querySelector('[data-trend-line="you"] path')?.getAttribute('d') ?? '';
    expect(path).toMatch(/H[\d.]+V[\d.]+/);
    expect(runsOf(container)).toBe(3);
    expect(container.querySelectorAll('[data-gap-bands] rect')).toHaveLength(1);
    expect(container.querySelectorAll('[data-trend-line="you"] rect')).toHaveLength(4);
  });

  it('names lines at their end, and falls back to a key when the names would collide', () => {
    const { container, rerender } = render(
      <StepChart
        label="Share"
        name="You"
        data={[
          { label: 'Jun', value: 10 },
          { label: 'Jul', value: 90 },
        ]}
        series={[{ label: 'Globex', values: [20, 10] }]}
      />,
    );
    const labels = () =>
      [...container.querySelectorAll('[data-end-labels] text')].map((node) => node.textContent);
    expect(labels()).toEqual(['You 90', 'Globex 10']);
    expect(container.querySelector('ul[aria-hidden]')).toBeNull();
    const shapes = () =>
      [...container.querySelectorAll('[data-trend-line]')].map((line) => [
        line.getAttribute('data-trend-line'),
        line.querySelector('[data-marker-shape]')?.getAttribute('data-marker-shape'),
      ]);
    expect(shapes()).toEqual([
      ['rival-1', 'square'],
      ['you', 'square'],
    ]);

    rerender(
      <StepChart
        label="Share"
        name="You"
        data={[
          { label: 'Jun', value: 10 },
          { label: 'Jul', value: 50 },
        ]}
        series={[{ label: 'Globex', values: [20, 51] }]}
      />,
    );
    expect(labels()).toEqual([]);
    expect(container.querySelector('ul[aria-hidden]')).toHaveTextContent('You50Globex51');
    // Keyed, each line takes its own shape so colour is not the only cue.
    expect(shapes()).toEqual([
      ['rival-1', 'diamond'],
      ['you', 'square'],
    ]);
  });

  it('dates a value older than the last point, and keys every line when one has nothing to label', () => {
    const { container, rerender } = render(
      <StepChart
        label="Share"
        name="You"
        data={[
          { label: '1 Jun 2026', axisLabel: 'Jun', value: 10 },
          { label: '1 Jul 2026', axisLabel: 'Jul', value: null },
        ]}
        series={[{ label: 'Globex', values: [80, 90] }]}
      />,
    );
    const labels = () =>
      [...container.querySelectorAll('[data-end-labels] text')].map((node) => node.textContent);
    expect(labels()).toEqual(['Globex 90', 'You 10 · as of Jun']);
    expect(container.querySelector('ul[aria-hidden]')).toBeNull();

    rerender(
      <StepChart
        label="Share"
        name="You"
        data={[
          { label: '1 Jun 2026', axisLabel: 'Jun', value: 10 },
          { label: '1 Jul 2026', axisLabel: 'Jul', value: null },
        ]}
        series={[{ label: 'Globex', values: [null, null] }]}
      />,
    );
    expect(labels()).toEqual([]);
    expect(container.querySelector('ul[aria-hidden]')).toHaveTextContent(
      'You10 · as of JunGlobexNot measured',
    );
  });

  it('draws your line in the accent unless the chart has no "you"', () => {
    const data = [
      { label: 'Jun', value: 1 },
      { label: 'Jul', value: 2 },
    ];
    const { container, rerender } = render(<StepChart label="Sessions" data={data} />);
    expect(container.querySelector('[data-trend-line="you"]')).not.toBeNull();
    rerender(<StepChart label="Sessions" data={data} you={false} />);
    expect(container.querySelector('[data-trend-line="you"]')).toBeNull();
    expect(container.querySelector('[data-trend-line="rival-1"]')).not.toBeNull();
  });

  it('ticks only the events inside the plotted span and lists them with method changes', () => {
    const day = (date: string) => new Date(`${date}T00:00:00Z`).getTime();
    const { container } = render(
      <StepChart
        label="Mention rate"
        data={[
          { label: '1 Mar', value: 40, timestamp: day('2026-03-01') },
          {
            label: '15 Mar',
            value: 70,
            timestamp: day('2026-03-15'),
            versionChange: { note: 'Scoring rule scoring-v2 applied' },
          },
        ]}
        events={[
          { key: 'inside', timestamp: day('2026-03-05'), label: 'Implemented: reviews page' },
          { key: 'before', timestamp: day('2026-02-01'), label: 'Implemented: old page' },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-event-marker]')).toHaveLength(1);
    expect(
      within(screen.getByRole('list', { name: 'Mention rate: marked' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Method changed at 15 Mar: Scoring rule scoring-v2 applied',
      'Implemented: reviews page',
    ]);
  });

  it('reads any point with the arrow keys in a tooltip sheet', async () => {
    const user = userEvent.setup();
    render(
      <StepChart
        label="Visibility trend"
        data={[
          { label: '1 Jun 2026', value: 40 },
          { label: '1 Jul 2026', value: 70 },
        ]}
      />,
    );
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('1 Jun 2026', { selector: 'p' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('1 Jun 2026', { selector: 'p' })).toBeNull();
  });
});
