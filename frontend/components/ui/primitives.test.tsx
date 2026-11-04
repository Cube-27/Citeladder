import { render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vite-plus/test';

import { Button } from './button';
import { Callout } from './callout';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Citation } from './citation';
import { EmptyState } from './empty-state';
import { EngineMark } from './engine-mark';
import { Field, FormRow } from './field';
import { Input } from './input';
import { Kbd } from './kbd';
import { BusyBar, ProgressBar } from './progress-bar';
import { Rungs } from './rungs';
import { ScoreBar, scoreFill } from './score-bar';
import { ScoreRing } from './score-ring';
import { Skeleton } from './skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { TrendChart } from './trend-chart';

describe('Button', () => {
  it('defaults to a non-submitting button', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toHaveAttribute('type', 'button');
  });
});

describe('Card', () => {
  it('renders semantic header/title/content slots', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    );
    expect(screen.getByText('Visibility').tagName).toBe('H3');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});

describe('Table (dense)', () => {
  it('preserves table headers and row values', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prompt</TableHead>
            <TableHead numeric>Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>How good is X?</TableCell>
            <TableCell numeric>82</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual(['Prompt', 'Score']);
    expect(screen.getByRole('cell', { name: 'How good is X?' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '82' })).toBeVisible();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
  });
});

describe('Input + Field', () => {
  it('wires label to input via generated id, and surfaces errors', () => {
    render(
      <Field label="Email" error="Required">
        {(fieldProps) => <Input placeholder="you@co" {...fieldProps} />}
      </Field>,
    );
    const input = screen.getByPlaceholderText('you@co');
    const label = screen.getByText('Email');
    expect(label).toHaveAttribute('for', input.id);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('forwards the ref to the native input inside an adorned frame', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Search" startContent={<span>S</span>} />);
    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Search' }));
  });
});

describe('FormRow', () => {
  it('names its control by the row label', () => {
    render(
      <FormRow label="Workspace name" description="Shown on invoices" htmlFor="workspace-name">
        <Input id="workspace-name" />
      </FormRow>,
    );
    expect(screen.getByRole('textbox', { name: 'Workspace name' })).toBeInTheDocument();
    expect(screen.getByText('Shown on invoices')).toBeInTheDocument();
  });
});

describe('Callout', () => {
  it('announces negative and warning callouts as alerts and the rest as status, with the tone word', () => {
    const { rerender } = render(
      <Callout tone="negative" title="Crawl failed">
        The site returned 503.
      </Callout>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Error: Crawl failedThe site returned 503.',
    );

    rerender(<Callout tone="positive">Saved</Callout>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('renders nothing without a title or body', () => {
    const { container } = render(<Callout tone="info" />);
    expect(container).toBeEmptyDOMElement();
    render(<Callout tone="info">Data refreshes nightly</Callout>);
    expect(screen.getByRole('status')).toHaveTextContent('Data refreshes nightly');
  });
});

describe('EmptyState', () => {
  it('names the empty view with a heading at the requested level and offers its actions', () => {
    render(
      <EmptyState
        title="No prompts yet"
        description="Add a prompt to start measuring."
        headingLevel={2}
        primary={<Button variant="primary">Add prompt</Button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'No prompts yet' })).toBeInTheDocument();
    expect(screen.getByText('Add a prompt to start measuring.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add prompt' })).toBeInTheDocument();
  });
});

describe('Skeleton', () => {
  it('announces one busy status by its label while the bars stay hidden', () => {
    render(<Skeleton variant="row" rows={3} label="Loading prompts" />);
    const status = screen.getByRole('status', { name: 'Loading prompts' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('');
  });
});

describe('ProgressBar', () => {
  it('reports its value in the product units and goes busy without one', () => {
    const { rerender } = render(
      <ProgressBar label="Running prompts" value={48} max={120} valueLabel="48 of 120 prompts" />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Running prompts' });
    expect(bar).toHaveAttribute('value', '48');
    expect(bar).toHaveAttribute('max', '120');
    expect(screen.getByText('48 of 120 prompts')).toBeInTheDocument();

    rerender(<ProgressBar label="Running prompts" />);
    const busy = screen.getByRole('progressbar', { name: 'Running prompts' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).not.toHaveAttribute('value');
  });

  it('shows a background refresh only while active', () => {
    const { rerender } = render(<BusyBar active={false} label="Updating usage" />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    rerender(<BusyBar active label="Updating usage" />);
    expect(screen.getByRole('progressbar', { name: 'Updating usage' })).toBeInTheDocument();
  });
});

describe('Kbd', () => {
  it('renders a combination as one key cap per key', () => {
    render(<Kbd keys={['⌘', 'K']} />);
    expect([...document.querySelectorAll('kbd')].map((key) => key.textContent)).toEqual(['⌘', 'K']);
  });
});

describe('Rungs', () => {
  it('always carries the citation level as words', () => {
    const { rerender } = render(<Rungs level={2} />);
    expect(screen.getByText('Cited')).toHaveClass('sr-only');
    rerender(<Rungs level={3} showLabel />);
    expect(screen.getByText('Top source')).not.toHaveClass('sr-only');
  });
});

describe('Citation', () => {
  it('links to the cited page in a new tab under its footnote and bare domain', () => {
    render(
      <Citation
        index={2}
        domain="www.example.com"
        title="Best running shoes"
        href="https://www.example.com/shoes"
      />,
    );
    const link = screen.getByRole('link', { name: /example\.com/ });
    expect(link).toHaveAttribute('href', 'https://www.example.com/shoes');
    expect(link).toHaveTextContent('2Eexample.comBest running shoes');
  });
});

describe('EngineMark', () => {
  it('draws the named engine as decoration only', () => {
    const { container } = render(<EngineMark engine="claude" />);
    const mark = container.querySelector('svg');
    expect(mark).toHaveAttribute('data-engine-mark', 'claude');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('scoreFill', () => {
  it('keeps one ink, or bands a compared score at 80 and 50', () => {
    expect(scoreFill('ink', 20)).toBe('ink');
    expect(scoreFill('auto', 80)).toBe('positive');
    expect(scoreFill('auto', 79)).toBe('warning');
    expect(scoreFill('auto', 50)).toBe('warning');
    expect(scoreFill('auto', 49)).toBe('negative');
  });
});

describe('ScoreRing', () => {
  it('announces the clamped score once, not again through its numeral', () => {
    render(<ScoreRing value={140} label="Site Health score" />);
    expect(screen.getByRole('img', { name: 'Site Health score: 100 out of 100' })).toBeVisible();
    expect(screen.getByText('100')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ScoreBar', () => {
  it('renders a clamped accessible meter with its number beside it', () => {
    const { rerender } = render(<ScoreBar value={140} label="Readiness score" />);
    const meter = screen.getByRole('meter', { name: 'Readiness score' });
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    expect(meter).toHaveAttribute('aria-valuetext', '100 out of 100');
    expect(screen.getByText('100')).toHaveAttribute('aria-hidden', 'true');

    rerender(<ScoreBar value={64} label="Readiness score" showValue={false} />);
    expect(screen.queryByText('64')).toBeNull();
  });
});

describe('TrendChart (cross-run Visibility trend)', () => {
  it('renders with an ARIA label describing the trend', () => {
    render(
      <TrendChart
        label="Visibility trend"
        data={[
          { label: 'Jun', value: 40 },
          { label: 'Jul', value: 70 },
        ]}
      />,
    );
    const chart = screen.getByRole('img', {
      name: 'Visibility trend: Trend from Jun (40) to Jul (70)',
    });
    expect(chart).toBeInTheDocument();
  });

  it('renders a single point without a misleading slope or area', () => {
    render(<TrendChart label="Visibility trend" data={[{ label: 'Jul', value: 55 }]} />);
    const chart = screen.getByRole('img', {
      name: 'Visibility trend: Single point Jul (55)',
    });
    expect(chart).toBeInTheDocument();
    expect(chart.querySelector(':scope > path')).toBeNull();
    expect(chart.querySelectorAll(':scope > circle')).toHaveLength(1);
  });

  it('draws no axes, ticks or gridlines unless an axis is named', () => {
    render(
      <TrendChart
        label="Visibility trend"
        data={[
          { label: 'Jun', value: 40 },
          { label: 'Jul', value: 70 },
        ]}
      />,
    );
    const chart = screen.getByRole('img', { name: /Visibility trend/ });
    expect(chart.querySelector('text')).toBeNull();
    expect(chart.querySelector('line')).toBeNull();
  });

  it('labels both axes and scales the y ticks to the domain', () => {
    render(
      <TrendChart
        label="Visibility trend"
        data={[
          { label: '1 Jun', value: 40 },
          { label: '1 Jul', value: 55 },
          { label: '1 Aug', value: 70 },
        ]}
        xAxisLabel="Run date"
        yAxisLabel="Visibility"
        formatTick={(value) => `${Math.round(value)}%`}
      />,
    );
    const chart = screen.getByRole('img', { name: /Visibility trend/ });
    const text = [...chart.querySelectorAll('text')].map((node) => node.textContent);
    expect(text).toContain('Run date');
    expect(text).toContain('Visibility');
    // Floor, midpoint and ceiling of the 0–100 domain.
    expect(text).toContain('0%');
    expect(text).toContain('50%');
    expect(text).toContain('100%');
    // First, middle and last point, so a reader can place the x positions.
    expect(text).toContain('1 Jun');
    expect(text).toContain('1 Jul');
    expect(text).toContain('1 Aug');
  });

  it('ticks the x axis with the short label, not the full point description', () => {
    render(
      <TrendChart
        label="Visibility trend"
        data={[
          { label: '1 Jun 2026 · 40%', axisLabel: '1 Jun', value: 40 },
          { label: '1 Jul 2026 · 70%', axisLabel: '1 Jul', value: 70 },
        ]}
        xAxisLabel="Run date"
        yAxisLabel="Visibility"
      />,
    );
    const chart = screen.getByRole('img', { name: /Visibility trend/ });
    const text = [...chart.querySelectorAll('text')].map((node) => node.textContent);
    expect(text).toContain('1 Jun');
    expect(text).not.toContain('1 Jun 2026 · 40%');
  });

  it('renders an empty state with no data points', () => {
    render(<TrendChart label="Visibility trend" data={[]} />);
    expect(
      screen.getByRole('img', { name: 'Visibility trend: No trend data' }),
    ).toBeInTheDocument();
  });

  it('marks events inside the plotted time span and names them to a screen reader', () => {
    const day = (date: string) => new Date(`${date}T00:00:00Z`).getTime();
    render(
      <TrendChart
        label="Mention rate"
        data={[
          { label: '1 Mar', value: 40, timestamp: day('2026-03-01') },
          { label: '15 Mar', value: 70, timestamp: day('2026-03-15') },
        ]}
        events={[
          { key: 'inside', timestamp: day('2026-03-05'), label: 'Implemented: reviews page' },
          { key: 'before', timestamp: day('2026-02-01'), label: 'Implemented: old page' },
        ]}
      />,
    );
    const chart = screen.getByRole('img', {
      name: 'Mention rate: Trend from 1 Mar (40) to 15 Mar (70) Marked: Implemented: reviews page.',
    });
    expect(chart.querySelectorAll('[data-event-marker]')).toHaveLength(1);
  });

  it('marks a version boundary with an accessible warning marker', () => {
    render(
      <TrendChart
        label="Visibility trend"
        data={[
          { label: 'Jun', value: 40 },
          { label: 'Jul', value: 70, versionChange: { note: 'Scoring rule scoring-v2 applied' } },
        ]}
      />,
    );
    const chart = screen.getByRole('img');
    const marker = chart.querySelector('[data-version-marker]');
    expect(marker).not.toBeNull();
    expect(
      within(chart as unknown as HTMLElement).getByText(/Scoring rule scoring-v2 applied/),
    ).toBeInTheDocument();
  });

  it('renders null values as gaps, announces them, and never draws a zero dot', () => {
    render(
      <TrendChart
        label="Visibility trend"
        data={[
          { label: 'Jun', value: 40 },
          { label: 'Jul', value: 50 },
          { label: 'Aug', value: null },
          { label: 'Sep', value: 60 },
          { label: 'Oct', value: 70 },
        ]}
      />,
    );
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute(
      'aria-label',
      'Visibility trend: Trend from Jun (40) to Oct (70) Some points are unavailable and shown as gaps.',
    );
    expect(chart.querySelectorAll(':scope > circle')).toHaveLength(4);
    expect(chart.querySelectorAll(':scope > path')).toHaveLength(2);
  });

  it('announces an unavailable endpoint value as "unavailable"', () => {
    render(
      <TrendChart
        label="Visibility trend"
        data={[
          { label: 'Jun', value: null },
          { label: 'Jul', value: 55 },
        ]}
      />,
    );
    expect(
      screen.getByRole('img', {
        name: 'Visibility trend: Trend from Jun (unavailable) to Jul (55) Some points are unavailable and shown as gaps.',
      }),
    ).toBeInTheDocument();
  });

  it('renders a single available point among nulls as a lone dot (no slope)', () => {
    render(
      <TrendChart
        label="Visibility trend"
        data={[
          { label: 'Jun', value: null },
          { label: 'Jul', value: 55 },
          { label: 'Aug', value: null },
        ]}
      />,
    );
    const chart = screen.getByRole('img');
    expect(chart.querySelectorAll(':scope > circle')).toHaveLength(1);
    expect(chart.querySelector(':scope > path')).toBeNull();
  });

  it('scales count metrics against a custom domainMax instead of clamping to 100', () => {
    const data = [
      { label: 'Jun', value: 250 },
      { label: 'Jul', value: 500 },
    ];
    const { unmount } = render(<TrendChart label="Clicks trend" data={data} domainMax={500} />);
    let chart = screen.getByRole('img', {
      name: 'Clicks trend: Trend from Jun (250) to Jul (500)',
    });
    let dots = chart.querySelectorAll(':scope > circle');
    expect(Number(dots[0]?.getAttribute('cy'))).toBeGreaterThan(
      Number(dots[1]?.getAttribute('cy')),
    );
    unmount();

    render(<TrendChart label="Clicks trend" data={data} />);
    chart = screen.getByRole('img', {
      name: 'Clicks trend: Trend from Jun (250) to Jul (500)',
    });
    dots = chart.querySelectorAll(':scope > circle');
    expect(dots[0]!.getAttribute('cy')).toBe(dots[1]!.getAttribute('cy'));
  });
});
