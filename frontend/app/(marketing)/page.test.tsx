import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';

import { queryKeys } from '@/lib/api/query-keys';
import { DEMO_HREF } from '@/lib/marketing-content/nav';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

import Page from './page';

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  replace.mockReset();
});
afterAll(() => mswServer.close());

/** Anonymous visitor. The handler exists so an accidental `me` fetch would
 * resolve rather than trip `onUnhandledRequest`, letting the test below assert
 * the query was never made at all. */
function stubAnonymous() {
  mswServer.use(
    http.get('/api/v1/auth/me', () =>
      HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 }),
    ),
  );
}

// Landing content only. The shared chrome (aurora/grain backdrop, LandingNav,
// LandingFooter) moved into the (marketing) route-group layout, whose
// next/font import makes direct layout renders impractical in vitest — the
// nav/footer contracts get colocated component tests and the layout
// composition is covered by e2e. The page renders no client island of its own:
// the nav resolves the session, and only for returning visitors.
describe('Landing page (public marketing `/`)', () => {
  it('renders exactly one h1 and reads no session of its own', async () => {
    stubAnonymous();
    const { queryClient } = renderWithProviders(<Page />);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/your buyers stopped googling you/i);

    // No h2-h6 may contain the product name (keeps heading queries unambiguous).
    const headings = screen.getAllByRole('heading');
    for (const heading of headings) {
      if (heading === h1s[0]) continue;
      expect(heading).not.toHaveTextContent(/citeladder/i);
    }

    // The page itself no longer reads the session — the nav does, and the nav
    // is not in this render — so `me` must never be fetched here. Asserting the
    // absence of the query is what keeps a session-reading island from being
    // reintroduced into the landing page: `onUnhandledRequest: 'error'` would
    // not catch it, because the handler above answers it.
    expect(queryClient.getQueryState(queryKeys.auth.me())).toBeUndefined();
    expect(replace).not.toHaveBeenCalled();
    expect(h1s[0]).toBeInTheDocument();
  });

  it('uses the shared primary button for the hero action', () => {
    stubAnonymous();
    const { container } = renderWithProviders(<Page />);

    // The funnel leaves the site for the parent company's contact form, so the
    // hero CTA must carry the external target and a safe `rel` alongside its
    // destination — a bare href here would open cube27.com in this tab.
    const hero = container.querySelector('header');
    const cta = hero?.querySelector(`a[href="${DEMO_HREF}"]`);
    expect(cta).toHaveTextContent('Book a demo');
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', 'noreferrer');
    expect(cta?.querySelector('svg')).not.toBeNull();
  });

  it('exposes the section anchors the shared chrome links to', () => {
    stubAnonymous();
    const { container } = renderWithProviders(<Page />);

    // The nav/footer (rendered by the layout) target these ids — pin them.
    for (const hash of [
      '#why',
      '#see-it',
      '#how-it-works',
      '#use-cases',
      '#trust',
      '#get-started',
    ]) {
      expect(container.querySelector(hash)).not.toBeNull();
    }
    expect(container.querySelector('#platform')).toBeNull();
  });

  it('closes with a FinalCta section pointing at the demo funnel', () => {
    stubAnonymous();
    renderWithProviders(<Page />);

    const finalCta = screen.getByRole('region', { name: 'Get started' });
    // Asserted by DESTINATION, not by label: the funnel is the contract here.
    const cta = within(finalCta).getByRole('link', { name: /book a demo/i });
    expect(cta).toHaveAttribute('href', DEMO_HREF);
  });

  it('keeps the first screen text-only and the reveal chapter directly after the hero', () => {
    stubAnonymous();
    const { container } = renderWithProviders(<Page />);

    const hero = container.querySelector('header');
    const main = container.querySelector('main');
    expect(hero).not.toBeNull();
    expect(hero).not.toHaveTextContent(/your ai visibility|tracking your brand/i);
    // The hero carries no product UI: type, one action, and the rotating
    // engine roster on the first screen. The reveal chapter follows it.
    expect(main?.children[0]).toBe(hero);
    expect(
      within(hero!).getByRole('img', { name: /ChatGPT, Grok, Gemini, Copilot, Claude/i }),
    ).toBeInTheDocument();
    expect(main?.children[1]).toHaveAttribute('id', 'why');
    expect(main?.children[2]).toHaveAttribute('id', 'see-it');
  });

  it('shows the product canvas once, after the hero states the problem', () => {
    stubAnonymous();
    const { container } = renderWithProviders(<Page />);

    // The product beat is the editorial workspace canvas: one share-of-
    // citations bar above a recorded-answers ledger, both rendered
    // aria-hidden so a drawing never reads as a measurement.
    const product = container.querySelector('#see-it');
    expect(product).not.toBeNull();
    expect(product).toHaveTextContent(/Share of citations/i);
    expect(screen.getByText('Illustrative workspace')).toBeVisible();
    expect(screen.queryByText(/Explore (Collect|Prioritize|Improve|Verify)/i)).toBeNull();
    expect(product).toHaveTextContent(/recorded answers/i);
    expect(product).not.toHaveTextContent(/Observe|Trace|Benchmark|Optimize/i);
    expect(product).not.toHaveTextContent(/example data/i);
  });
});
