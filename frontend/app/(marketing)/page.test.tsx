import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';

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

/** Anonymous visitor: the session check 401s and the island stays inert. */
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
// composition is covered by e2e. The LandingSessionRedirect island itself is
// covered exhaustively in components/marketing/landing-session-redirect.test.tsx.
describe('Landing page (public marketing `/`)', () => {
  it('renders exactly one h1 and keeps the marketing content up after the 401 settles', async () => {
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

    // The session-check island stays inert for an anonymous visitor: the 401
    // settles, no redirect fires, and the content never leaves the screen.
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.auth.me())?.status).toBe('error'),
    );
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

  it('keeps the first screen text-only and places the workspace directly after it', () => {
    stubAnonymous();
    const { container } = renderWithProviders(<Page />);

    const hero = container.querySelector('header');
    const main = container.querySelector('main');
    expect(hero).not.toBeNull();
    expect(hero).not.toHaveTextContent(/your ai visibility|tracking your brand/i);
    expect(main?.children[0]).toBe(hero);
    // The reveal chapter follows the hook; the product canvas comes after it.
    expect(main?.children[1]).toHaveAttribute('id', 'why');
  });

  it('shows the product canvas once, after the hero states the problem', () => {
    stubAnonymous();
    const { container } = renderWithProviders(<Page />);

    // The product beat is the editorial workspace canvas: one share-of-
    // citations bar above a recorded-answers ledger, carrying the
    // illustrative-workspace marker so a drawing never reads as a measurement.
    const product = container.querySelector('#see-it');
    expect(product).not.toBeNull();
    expect(product).toHaveTextContent(/Illustrative workspace/i);
    expect(product).toHaveTextContent(/Share of citations/i);
    expect(product).toHaveTextContent(/recorded answers/i);
    expect(product).not.toHaveTextContent(/Observe|Trace|Benchmark|Optimize/i);
    expect(product).not.toHaveTextContent(/example data/i);
  });

  it('renders the reveal section as a three-item ledger and keeps one product workspace', () => {
    stubAnonymous();
    const { container } = renderWithProviders(<Page />);

    expect(container.querySelectorAll('#why article')).toHaveLength(3);
    expect(container.querySelector('#why .shadow-card')).toBeNull();
    // Pin #see-it itself first: an optional-chained query below would pass
    // vacuously if the section vanished.
    const seeIt = container.querySelector('#see-it');
    expect(seeIt).not.toBeNull();
    expect(seeIt?.querySelector('[data-testid="product-canvas"]')).not.toBeNull();
  });
});
