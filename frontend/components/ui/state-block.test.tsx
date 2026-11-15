import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';

import { ApiError } from '@/lib/api/errors';

import { StateBlock, screenState } from './state-block';

type Coverage = Readonly<{ crawled_pages: number | null }>;
type MeasuredCoverage = Readonly<{ crawled_pages: number }>;

const isMeasured = (data: Coverage): data is MeasuredCoverage => data.crawled_pages !== null;

/** A screen that reads crawl coverage the way an owner screen does. */
function CoverageScreen({ load }: Readonly<{ load: () => Promise<Coverage> }>) {
  const read = screenState(useQuery({ queryKey: ['coverage'], queryFn: load }), {
    subject: 'crawl coverage',
    measured: isMeasured,
    notMeasured: { description: 'Coverage appears after the first crawl finishes.' },
  });
  if (read.kind === 'state') return <StateBlock {...read.state} />;
  return <p>{`${read.data.crawled_pages} pages crawled`}</p>;
}

/** Answers each fetch with the next outcome, in order. */
function inTurn(...outcomes: Array<() => Promise<Coverage>>) {
  let next = 0;
  return () => outcomes[next++]?.() ?? Promise.reject(new Error('No answer left'));
}

function renderScreen(load: () => Promise<Coverage>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CoverageScreen load={load} />
    </QueryClientProvider>,
  );
  return client;
}

describe('screenState with StateBlock', () => {
  it('shows loading while the read is pending', async () => {
    renderScreen(() => new Promise<Coverage>(() => {}));

    expect(await screen.findByRole('status', { name: 'Loading crawl coverage…' })).toBeVisible();
  });

  it('says what failed to load and retries exactly that read', async () => {
    const load = inTurn(
      () => Promise.reject(new ApiError('Service unavailable', 503, '', 'request-7')),
      () => Promise.resolve({ crawled_pages: 12 }),
    );
    const user = userEvent.setup();
    renderScreen(load);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load crawl coverage");
    expect(alert).toHaveTextContent('Service unavailable');
    expect(alert).toHaveTextContent('Service unavailable · Reference request-7');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('12 pages crawled')).toBeVisible();
  });

  it('says "Not measured yet", not zero, when the answer holds no measurement', async () => {
    renderScreen(() => Promise.resolve({ crawled_pages: null }));

    expect(await screen.findByRole('heading', { name: 'Not measured yet' })).toBeVisible();
    // The hatched tag repeats the heading, so only the heading is read.
    expect(screen.getByText(/^not measured$/i)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Coverage appears after the first crawl finishes.')).toBeVisible();
    expect(screen.queryByText(/pages crawled/)).not.toBeInTheDocument();
  });

  it('renders an observed zero as the measured value', async () => {
    renderScreen(() => Promise.resolve({ crawled_pages: 0 }));

    expect(await screen.findByText('0 pages crawled')).toBeVisible();
    expect(screen.queryByText('Not measured yet')).not.toBeInTheDocument();
  });

  it('reports a failed refetch instead of the stale answer', async () => {
    const load = inTurn(
      () => Promise.resolve({ crawled_pages: 4 }),
      () => Promise.reject(new Error('Network down')),
    );
    const client = renderScreen(load);
    expect(await screen.findByText('4 pages crawled')).toBeVisible();

    await client.refetchQueries({ queryKey: ['coverage'] });

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load crawl coverage");
    expect(screen.queryByText('4 pages crawled')).not.toBeInTheDocument();
  });
});

describe('StateBlock empty states', () => {
  it('names an empty read with a page-level heading by default and offers its action', () => {
    render(
      <StateBlock
        kind="empty"
        heading="No prompts yet"
        description="Add a prompt to start measuring."
        action={<button type="button">Add prompt</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'No prompts yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add prompt' })).toBeInTheDocument();
  });

  it('offers to clear the filters when a filtered read matches nothing', async () => {
    let cleared = 0;
    const user = userEvent.setup();
    render(<StateBlock kind="filtered" onClear={() => (cleared += 1)} />);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(cleared).toBe(1);
  });
});
