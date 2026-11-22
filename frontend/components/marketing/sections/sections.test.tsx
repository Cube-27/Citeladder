import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { AnnouncementPill } from '../chrome/announcement-pill';
import { Breadcrumbs } from '../chrome/breadcrumbs';
import { EngineStrip, LogoTile, QuestionCards, RelatedCards } from './cards';
import { Bento, FeatureCard, FeatureSplit } from './features';
import { LandingHero, PageHero } from './heroes';
import { PageForm } from './page-form';
import { PageHighlight } from './page-highlight';
import { PageSection, SectionHeader } from './page-section';
import { PagePlans, PricingCard, PricingTable } from './pricing';
import { columnsFor } from './site-parts';
import { CtaBand, FaqList } from './steps-faq-cta';
import { ToolPanel } from './tool-panel';

describe('chrome parts', () => {
  it('marks the last crumb as the current page and links the rest', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Platform', href: '/platform' },
          { label: 'Site Health', href: '/platform/site-health' },
        ]}
      />,
    );
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Platform' })).toHaveAttribute(
      'href',
      '/platform',
    );
    expect(within(trail).queryByRole('link', { name: 'Site Health' })).toBeNull();
    expect(within(trail).getByText('Site Health')).toHaveAttribute('aria-current', 'page');
  });

  it('makes the whole announcement the link', () => {
    render(
      <AnnouncementPill href="/platform/mcp" tag="New">
        Connect CiteLadder to Claude
      </AnnouncementPill>,
    );
    expect(screen.getByRole('link', { name: 'New Connect CiteLadder to Claude' })).toHaveAttribute(
      'href',
      '/platform/mcp',
    );
  });
});

describe('section headings', () => {
  it('heads a section at the level asked for, with its lead', () => {
    render(<SectionHeader as="h3" title="Three steps" lead="Start fast" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Three steps' })).toBeInTheDocument();
    expect(screen.getByText('Start fast')).toBeInTheDocument();
  });

  it('names an untitled section by its label and a titled one by its heading', () => {
    const { rerender } = render(
      <PageSection id="engines" label="Monitored answer engines">
        <p>Strip</p>
      </PageSection>,
    );
    expect(screen.getByRole('region', { name: 'Monitored answer engines' })).toHaveAttribute(
      'id',
      'engines',
    );

    rerender(
      <PageSection title="Questions" label="ignored">
        <p>Body</p>
      </PageSection>,
    );
    expect(screen.queryByRole('region', { name: 'ignored' })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Questions' })).toBeInTheDocument();
  });

  it('gives a label-only section an h2 when its cards are h3, so headings never skip a level', () => {
    render(
      <PageSection label="AI Visibility highlights" labelHeading>
        <FeatureCard title="Prompts sorted by buyer stage" />
      </PageSection>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'AI Visibility highlights' });
    expect(screen.getByRole('region', { name: 'AI Visibility highlights' })).toContainElement(
      heading,
    );
    expect(
      screen.getByRole('heading', { level: 3, name: 'Prompts sorted by buyer stage' }),
    ).toBeInTheDocument();
  });

  it('opens an inner page with one H1 under its breadcrumbs', () => {
    render(
      <PageHero
        crumbs={[{ label: 'Platform', href: '/platform' }, { label: 'MCP' }]}
        title="Use your data in your assistant"
        meta="Updated weekly"
      >
        <figure>Shot</figure>
      </PageHero>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Use your data in your assistant',
    );
    expect(screen.getByText('MCP')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('figure')).toHaveTextContent('Shot');
  });

  it('puts the announcement above the landing H1', () => {
    render(
      <LandingHero
        announcement={<AnnouncementPill href="/new">News</AnnouncementPill>}
        title="See what AI answers say"
        note="7-day free trial"
      />,
    );
    const link = screen.getByRole('link', { name: 'News' });
    const heading = screen.getByRole('heading', { level: 1, name: 'See what AI answers say' });
    expect(link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('7-day free trial')).toBeInTheDocument();
  });
});

describe('feature sections', () => {
  it('makes a linked feature card one link named by its title and destination line', () => {
    render(
      <FeatureCard
        href="/platform/site-health"
        linkLabel="Explore Site Health"
        title="Site Health"
        body="Find issues"
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Site Health Find issues Explore Site Health' }),
    ).toHaveAttribute('href', '/platform/site-health');
  });

  it('renders an unlinked feature card as an article with no link', () => {
    render(<FeatureCard title="Evidence" />);
    expect(screen.getByRole('article')).toHaveTextContent('Evidence');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps each bento cell in its span band for narrow screens', () => {
    const { container } = render(
      <Bento
        cells={[
          { key: 'a', span: 3, content: 'A' },
          { key: 'b', span: 7, content: 'B' },
          { key: 'c', span: 12, content: 'C' },
        ]}
      />,
    );
    const bands = [...container.querySelectorAll('[data-span-band]')].map((cell) => [
      cell.textContent,
      cell.getAttribute('data-span-band'),
    ]);
    expect(bands).toEqual([
      ['A', 'small'],
      ['B', 'medium'],
      ['C', 'large'],
    ]);
  });

  it('lists a split’s points and links on', () => {
    render(
      <FeatureSplit
        title="Cited sources"
        points={['Every domain', 'Every page']}
        links={[
          { href: '/platform/cited-sources', label: 'See sources' },
          { href: '/platform/ai-visibility', label: 'See visibility' },
        ]}
        media={<div>Frame</div>}
      />,
    );
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Every domain',
      'Every page',
    ]);
    expect(
      screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['See sources', '/platform/cited-sources'],
      ['See visibility', '/platform/ai-visibility'],
    ]);
  });
});

describe('FaqList', () => {
  it('starts closed and shares one group name when exclusive', () => {
    const { container } = render(
      <FaqList
        exclusive
        items={[
          { question: 'Is there a trial?', answer: 'Yes, seven days.' },
          { question: 'Can I cancel?', answer: <p>Any time.</p> },
        ]}
      />,
    );
    const rows = [...container.querySelectorAll('details')];
    expect(rows.map((row) => row.open)).toEqual([false, false]);
    expect(rows[0]?.getAttribute('name')).toBeTruthy();
    expect(rows[0]?.getAttribute('name')).toBe(rows[1]?.getAttribute('name'));
    expect(screen.getByText('Yes, seven days.').tagName).toBe('P');
  });

  it('leaves rows independent when not exclusive', () => {
    const { container } = render(<FaqList items={[{ question: 'Q', answer: 'A' }]} />);
    expect(container.querySelector('details')?.hasAttribute('name')).toBe(false);
  });
});

describe('cards and strips', () => {
  it('fills each card row from the item count', () => {
    expect([1, 2, 3, 4, 5, 6, 8, 9].map(columnsFor)).toEqual([1, 2, 3, 4, 3, 3, 4, 3]);
  });

  it('links each related row to its destination, naming it by title and any label', () => {
    render(
      <RelatedCards
        items={[
          { href: '/platform/mcp', title: 'MCP' },
          { href: '/pricing', title: 'Pricing', linkLabel: 'See plans' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'MCP' })).toHaveAttribute('href', '/platform/mcp');
    expect(screen.getByRole('link', { name: 'Pricing See plans' })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  it('lays four or eight questions in two columns and other counts in three', () => {
    const { container, rerender } = render(<QuestionCards questions={['a', 'b', 'c', 'd']} />);
    expect(container.querySelector('ul')).toHaveAttribute('data-cols', '2');
    rerender(<QuestionCards questions={['a', 'b', 'c', 'd', 'e']} />);
    expect(container.querySelector('ul')).toHaveAttribute('data-cols', '3');
  });

  it('names an engine tile for screen readers when the name is hidden', () => {
    render(<LogoTile engine="gemini" hideName href="/platform/ai-visibility" />);
    expect(screen.getByRole('link', { name: 'Gemini' })).toHaveAttribute(
      'href',
      '/platform/ai-visibility',
    );
  });

  it('lists the answer engines by name, AI Mode with the Google mark', () => {
    render(<EngineStrip />);
    const list = screen.getByRole('list', { name: 'Answers collected from' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['ChatGPT', 'Claude', 'Gemini', 'Google AI Overviews', 'Google AI Mode']);
    expect(list.querySelectorAll('[data-engine-mark="google"]')).toHaveLength(2);
  });

  it('names an engine by the source its answers come through when given one', () => {
    render(<EngineStrip engines={['chatgpt', 'google']} names={{ chatgpt: 'OpenAI API' }} />);
    expect(
      within(screen.getByRole('list', { name: 'Answers collected from' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['OpenAI API', 'Google AI Overviews']);
  });
});

describe('highlight and form', () => {
  it('pairs each highlight stat with its label', () => {
    render(
      <PageHighlight
        title="Proof"
        stats={[
          { label: 'Visibility', value: '38.4%' },
          { label: 'Citations', value: '212' },
        ]}
      />,
    );
    const terms = screen.getAllByRole('term').map((term) => term.textContent);
    const values = screen.getAllByRole('definition').map((value) => value.textContent);
    expect(terms).toEqual(['Visibility', 'Citations']);
    expect(values).toEqual(['38.4%', '212']);
  });

  it('reserves the verification slot beside the submit button until a widget arrives', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const { rerender } = render(
      <PageForm
        title="Book a demo"
        submit={<button type="submit">Send</button>}
        onSubmit={onSubmit}
      >
        <input aria-label="Email" />
      </PageForm>,
    );
    const form = screen.getByRole('form', { name: 'Book a demo' });
    expect(form).toHaveTextContent('Verification check loads here');
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(
      <PageForm title="Book a demo" turnstile={false} submit={<button type="submit">Send</button>}>
        <input aria-label="Email" />
      </PageForm>,
    );
    expect(screen.getByRole('form')).not.toHaveTextContent('Verification check loads here');
  });
});

describe('pricing and comparison', () => {
  it('names a plan, its price and its features', () => {
    render(
      <PagePlans>
        <PricingCard
          name="Growth"
          badge="Popular"
          featured
          price="$99"
          period="per month"
          features={['120 prompts', 'Four engines']}
        />
        <PricingCard name="Starter" price="$29" />
      </PagePlans>,
    );
    const growth = screen.getByRole('article', { name: 'Growth' });
    expect(growth).toHaveTextContent('Popular');
    expect(growth).toHaveTextContent('$99per month');
    expect(
      within(growth)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['120 prompts', 'Four engines']);
  });

  it('says included and not included in words in the plan table', () => {
    render(
      <PricingTable
        plans={[{ name: 'Starter' }, { name: 'Growth', price: '$99' }]}
        groups={[
          {
            title: 'Tracking',
            rows: [
              { label: 'Prompts', values: ['30', '120'] },
              { label: 'MCP', values: [false, true] },
            ],
          },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Plan comparison' });
    const mcp = within(table).getByRole('row', { name: /MCP/ });
    expect(
      within(mcp)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Not included', 'Included']);
    const prompts = within(table).getByRole('row', { name: /Prompts/ });
    expect(
      within(prompts)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['30', '120']);
  });

  it('closes a CTA band with its actions', () => {
    render(
      <CtaBand title="Start tracking" actions={<a href="/register">Sign up</a>} note="No card" />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Start tracking' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/register');
  });
});

describe('ToolPanel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the empty line and disables Copy before a result', () => {
    render(<ToolPanel title="Robots.txt generator" form={<input aria-label="Site" />} />);
    expect(screen.getByRole('region', { name: 'Robots.txt generator' })).toHaveTextContent(
      'Results appear here.',
    );
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('copies the result and confirms in the status, then clears it', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <ToolPanel
        title="Robots.txt generator"
        form={null}
        result={<pre>User-agent: *</pre>}
        copyText="User-agent: *"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith('User-agent: *');
    expect(screen.getByRole('status').textContent).toBe('Copied');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('shows a refused copy until the next press', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn((): Promise<void> =>
      Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    );
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <ToolPanel title="Robots.txt generator" form={null} result={<pre>x</pre>} copyText="x" />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByRole('status').textContent).toBe('Couldn’t copy');

    writeText.mockImplementation(() => Promise.resolve());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(screen.getByRole('status').textContent).toBe('Copied');
  });
});
