import { http, HttpResponse } from 'msw';
import { useQuery } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DEMO_HREF, NAV_DROPS } from '@/lib/marketing-content/nav';
import { queryKeys } from '@/lib/api/query-keys';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { MarketingNav } from './nav';
import {
  RETURNING_VISITOR_ATTRIBUTE,
  SESSION_HINT_COOKIE,
  clearSessionHintCookie,
  hasSessionHintCookie,
} from './returning-visitor-hint';

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  clearSessionHintCookie();
  document.documentElement.removeAttribute(RETURNING_VISITOR_ATTRIBUTE);
});
afterAll(() => mswServer.close());

function stubAnonymous() {
  mswServer.use(
    http.get('/api/v1/auth/me', () =>
      HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 }),
    ),
  );
}

function stubSignedIn() {
  mswServer.use(
    http.get('/api/v1/auth/me', () =>
      HttpResponse.json({
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'evaluator@example.com',
          role: 'user',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      }),
    ),
    http.get('/api/v1/projects', () => HttpResponse.json([])),
  );
}

function NavWithAnonymousPricingSession() {
  useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: async () => null,
  });
  return <MarketingNav />;
}

function NavWithCachedMarketingSession() {
  useQuery({
    queryKey: queryKeys.auth.marketingSession(),
    queryFn: async () => true,
    initialData: true,
  });
  return <MarketingNav />;
}

/**
 * The nav's INTERACTION contract, which survived the Proof rewrite unchanged
 * and is the part most likely to regress silently: hover- and focus-opened
 * dropdowns, Escape to close, truthful `aria-expanded`, and the mobile
 * accordions. The visual system is covered by the design-token suite; this
 * file guards behaviour only.
 */
describe('MarketingNav', () => {
  it('gives every Platform menu row a distinct destination', () => {
    const platform = NAV_DROPS.find((drop) => drop.key === 'platform');
    const hrefs = platform?.groups.flatMap((group) => group.items.map((item) => item.href)) ?? [];

    expect(hrefs).toHaveLength(4);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('opens a dropdown on hover and on focus, and closes it with Escape', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    for (const drop of NAV_DROPS) {
      const directLink = screen.getByRole('link', {
        name: new RegExp(`^${drop.label}$`, 'i'),
      });
      expect(directLink).toHaveAttribute('href', drop.href);
      expect(directLink).toHaveAttribute('aria-expanded', 'false');
      expect(document.querySelector(`nav button[aria-label="Open ${drop.label} menu"]`)).toBeNull();

      await user.hover(directLink);
      await waitFor(() => expect(directLink).toHaveAttribute('aria-expanded', 'true'));

      // The panel is a disclosure of ordinary links, not an ARIA menu: that
      // pattern would promise arrow-key navigation this nav does not
      // implement, and `menuitem` would override the link role screen readers
      // should announce. It is found by the id the trigger points at.
      const panel = document.getElementById(`desktop-nav-panel-${drop.key}`);
      expect(panel).not.toBeNull();
      expect(panel).toHaveClass('marketing-nav-panel');
      expect(directLink).toHaveAttribute('aria-controls', `desktop-nav-panel-${drop.key}`);
      const expected = drop.groups.reduce((sum, group) => sum + group.items.length, 0);
      expect(within(panel as HTMLElement).getAllByRole('link')).toHaveLength(expected);

      await user.keyboard('{Escape}');
      await waitFor(() => expect(directLink).toHaveAttribute('aria-expanded', 'false'));
      await user.unhover(directLink);
    }
  });

  it('still opens a dropdown on focus after a row was selected', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    // Selecting a row suppresses hover so a resting pointer cannot reopen the
    // panel it just closed. That suppression must not reach the keyboard: a
    // user tabbing to the next trigger has explicitly asked for it, and a flag
    // only a `mouseleave` can clear would leave them with no dropdowns at all.
    const [first, second] = NAV_DROPS;
    const firstTrigger = screen.getByRole('link', {
      name: new RegExp(`^${first.label}$`, 'i'),
    });
    await user.hover(firstTrigger);
    await waitFor(() => expect(firstTrigger).toHaveAttribute('aria-expanded', 'true'));

    const panel = document.getElementById(`desktop-nav-panel-${first.key}`);
    await user.click(within(panel as HTMLElement).getAllByRole('link')[0]);
    await waitFor(() => expect(firstTrigger).toHaveAttribute('aria-expanded', 'false'));

    const secondTrigger = screen.getByRole('link', {
      name: new RegExp(`^${second.label}$`, 'i'),
    });
    secondTrigger.focus();

    await waitFor(() => expect(secondTrigger).toHaveAttribute('aria-expanded', 'true'));
    expect(document.getElementById(`desktop-nav-panel-${second.key}`)).not.toHaveClass(
      'marketing-nav-panel',
    );
  });

  it('closes a dropdown when its top-level page link is chosen', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    const solutions = screen.getByRole('link', { name: /^solutions$/i });
    await user.hover(solutions);
    await waitFor(() => expect(solutions).toHaveAttribute('aria-expanded', 'true'));

    await user.click(solutions);
    await waitFor(() => expect(solutions).toHaveAttribute('aria-expanded', 'false'));
  });

  it('opens another dropdown when hovering to another option after selecting one', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    const solutions = screen.getByRole('link', { name: /^solutions$/i });
    await user.hover(solutions);
    await waitFor(() => expect(solutions).toHaveAttribute('aria-expanded', 'true'));

    await user.click(solutions);
    await waitFor(() => expect(solutions).toHaveAttribute('aria-expanded', 'false'));

    // Moving across to another option in the topbar immediately reveals its dropdown.
    const platform = screen.getByRole('link', { name: /^platform$/i });
    await user.hover(platform);
    await waitFor(() => expect(platform).toHaveAttribute('aria-expanded', 'true'));
  });

  it('re-opens a dropdown when pointer leaves and returns to the trigger', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    const solutions = screen.getByRole('link', { name: /^solutions$/i });
    await user.hover(solutions);
    await waitFor(() => expect(solutions).toHaveAttribute('aria-expanded', 'true'));

    await user.click(solutions);
    await waitFor(() => expect(solutions).toHaveAttribute('aria-expanded', 'false'));

    // Moving off the trigger and back re-arms hover without needing to leave the topbar completely.
    await user.unhover(solutions);
    await user.hover(solutions);
    await waitFor(() => expect(solutions).toHaveAttribute('aria-expanded', 'true'));
  });

  it('marks the navigation as scrolled after the page scrolls', async () => {
    stubAnonymous();
    renderWithProviders(<MarketingNav />);

    const chrome = document.querySelector<HTMLElement>('[data-marketing-nav]');
    expect(chrome).not.toBeNull();

    // `scrollY` is an accessor on the jsdom window, and overriding it with a
    // data property leaks into every later test in the file unless the
    // original descriptor goes back — hence the capture/restore pair.
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
    try {
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: 24,
      });
      window.dispatchEvent(new Event('scroll'));

      // The behaviour is the contract: the bar flags itself as scrolled and the
      // stylesheet keys off that. Asserting the specific fill/hairline classes
      // only made restyling the chrome a test edit.
      await waitFor(() => expect(chrome).toHaveAttribute('data-scrolled', 'true'));
    } finally {
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        Reflect.deleteProperty(window, 'scrollY');
      }
      window.dispatchEvent(new Event('scroll'));
    }
  });

  it('exposes every dropdown as a mobile accordion with truthful aria-expanded', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();

    for (const drop of NAV_DROPS) {
      // Both the desktop trigger and the accordion head carry the label, so
      // disambiguate on the control the accordion body is wired to.
      const head = document.querySelector<HTMLElement>(`button[aria-controls="acc-${drop.key}"]`);
      expect(head, `accordion head for ${drop.key}`).not.toBeNull();
      expect(head).toHaveAttribute('aria-expanded', 'false');

      await user.click(head!);
      expect(head).toHaveAttribute('aria-expanded', 'true');

      const body = document.querySelector<HTMLElement>(`#acc-${drop.key}`);
      const expected = drop.groups.reduce((sum, group) => sum + group.items.length, 0);
      expect(within(body!).getAllByRole('link')).toHaveLength(expected);
    }

    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    await waitFor(() => expect(document.querySelector('#mobile-menu')).toBeNull());
  });

  it('closes the mobile menu when a row is chosen', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const head = document.querySelector<HTMLElement>('button[aria-controls="acc-platform"]');
    await user.click(head!);

    // Choosing a destination must dismiss the sheet: leaving it open covers
    // the page the visitor just navigated to.
    const body = document.querySelector<HTMLElement>('#acc-platform');
    await user.click(within(body!).getAllByRole('link')[0]);

    await waitFor(() => expect(document.querySelector('#mobile-menu')).toBeNull());
  });

  it('closes the mobile menu when a dropdown section page is chosen', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobile = document.querySelector('#mobile-menu');
    expect(mobile).not.toBeNull();
    await user.click(within(mobile as HTMLElement).getByRole('link', { name: /^solutions$/i }));

    await waitFor(() => expect(document.querySelector('#mobile-menu')).toBeNull());
  });

  it('closes the mobile menu on a tap outside the chrome', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(document.querySelector('#mobile-menu')).not.toBeNull();

    // A tap on the page behind the sheet dismisses it — on touch there is no
    // blur to rely on, so the chrome listens for `pointerdown` on the document.
    await user.click(document.body);

    await waitFor(() => expect(document.querySelector('#mobile-menu')).toBeNull());
  });

  it('closes the mobile menu from the toggle, leaving it reopenable', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    // The toggle closes the menu exactly once. The outside-click boundary is
    // the whole chrome rather than the sheet alone — were it the sheet, this
    // tap would be treated as "outside", close the menu, and the toggle's own
    // handler would then reopen it, leaving the menu stuck open.
    await user.click(screen.getByRole('button', { name: 'Close menu' }));

    await waitFor(() => expect(document.querySelector('#mobile-menu')).toBeNull());
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  it('shows the demo-first CTA and a login link to an anonymous visitor', async () => {
    stubAnonymous();
    renderWithProviders(<MarketingNav />);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /book a demo/i })).toHaveAttribute('href', DEMO_HREF),
    );
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
    // Proof is a light-only identity — a theme toggle here would do nothing.
    expect(screen.queryByRole('button', { name: /toggle color theme/i })).toBeNull();
  });

  it('does not request session state for an anonymous visitor without a hint', async () => {
    const requested = vi.fn();
    mswServer.use(
      http.get('/api/v1/auth/me', () => {
        requested();
        return HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<MarketingNav />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(requested).not.toHaveBeenCalled();
    expect(screen.getAllByRole('link', { name: /log in/i })).not.toHaveLength(0);
  });

  it('keeps log in in the topbar at every width and puts the demo CTA in the mobile menu', async () => {
    stubAnonymous();
    const user = userEvent.setup();
    renderWithProviders(<MarketingNav />);

    // jsdom cannot evaluate media queries, so the responsive split is
    // asserted on the gating classes: the login link carries none, and the
    // topbar demo CTA is gated to `sm` and above.
    const login = await screen.findByRole('link', { name: /log in/i });
    expect(login).toHaveAttribute('href', '/login');
    expect(login.getAttribute('class') ?? '').not.toMatch(/\bhidden\b/);

    const topbarDemo = screen.getByRole('link', { name: /book a demo/i });
    expect(topbarDemo.getAttribute('class')?.includes('hidden')).toBe(true);
    expect(topbarDemo.getAttribute('class')?.includes('sm:inline-flex')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = document.querySelector('#mobile-menu');
    expect(menu).not.toBeNull();
    const menuDemo = within(menu as HTMLElement).getByRole('link', {
      name: /book a demo/i,
    });
    expect(menuDemo).toHaveAttribute('href', DEMO_HREF);
    expect(menuDemo).toHaveAttribute('target', '_blank');
    await user.click(menuDemo);
    await waitFor(() => expect(document.querySelector('#mobile-menu')).toBeNull());
  });

  /**
   * A browser holding a hint for a session that was revoked before its expiry
   * (signed out elsewhere, or `session_version` bumped): the pre-hydration mark
   * hid the anonymous actions, so once `me` says 401 the mark must be gone or
   * "Log in" stays invisible forever.
   */
  it('releases the returning-visitor mark so a stale hint still ends at Log in', async () => {
    stubAnonymous();
    document.cookie = `${SESSION_HINT_COOKIE}=1; path=/`;
    document.documentElement.setAttribute(RETURNING_VISITOR_ATTRIBUTE, '');
    try {
      renderWithProviders(<MarketingNav />);

      // The mark survives until `me` answers — dropping it sooner would hand
      // the row back to CSS's anonymous default mid-flight.
      await waitFor(() =>
        expect(document.documentElement.hasAttribute(RETURNING_VISITOR_ATTRIBUTE)).toBe(false),
      );
      expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
      expect(screen.queryByRole('link', { name: /dashboard/i })).toBeNull();
      // And the hint itself goes, so the NEXT load paints "Log in" directly
      // instead of flashing "Dashboard" and taking it away again.
      expect(hasSessionHintCookie()).toBe(false);
    } finally {
      clearSessionHintCookie();
      document.documentElement.removeAttribute(RETURNING_VISITOR_ATTRIBUTE);
    }
  });

  /**
   * The inverse: a live session must not have its hint swept up, or every
   * marketing navigation would re-introduce the flash it exists to prevent.
   */
  it('keeps the session hint when me confirms the session', async () => {
    stubSignedIn();
    document.cookie = `${SESSION_HINT_COOKIE}=1; path=/`;
    try {
      renderWithProviders(<MarketingNav />);

      await waitFor(() =>
        expect(screen.getAllByRole('link', { name: /dashboard/i })).not.toHaveLength(0),
      );
      expect(hasSessionHintCookie()).toBe(true);
    } finally {
      clearSessionHintCookie();
    }
  });

  it('keeps the returning marker until a live session resolves on refresh', async () => {
    let releaseMe!: () => void;
    const meSettled = new Promise<void>((resolve) => {
      releaseMe = resolve;
    });
    mswServer.use(
      http.get('/api/v1/auth/me', async () => {
        await meSettled;
        return HttpResponse.json({
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'evaluator@example.com',
            role: 'user',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        });
      }),
      http.get('/api/v1/projects', () => HttpResponse.json([])),
    );
    document.cookie = `${SESSION_HINT_COOKIE}=1; path=/`;
    document.documentElement.setAttribute(RETURNING_VISITOR_ATTRIBUTE, '');

    const { container } = renderWithProviders(<MarketingNav />);

    expect(document.documentElement).toHaveAttribute(RETURNING_VISITOR_ATTRIBUTE);
    expect(container.querySelector('[data-session-anon]')).not.toBeNull();
    expect(container.querySelector('[data-session-returning]')).not.toBeNull();

    releaseMe();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
        'href',
        '/onboarding',
      ),
    );
    expect(document.documentElement).not.toHaveAttribute(RETURNING_VISITOR_ATTRIBUTE);
  });

  it('does not treat a successful null session cache entry as authenticated', () => {
    const { container } = renderWithProviders(<NavWithAnonymousPricingSession />);

    // The disabled marketing query remains pending, so static markup carries
    // both answers. With no hint marker, CSS selects the anonymous branch.
    expect(container.querySelector('[data-session-anon]')).not.toBeNull();
    expect(container.querySelector('[data-session-returning]')).not.toBeNull();
    expect(document.documentElement).not.toHaveAttribute(RETURNING_VISITOR_ATTRIBUTE);
  });

  it('does not trust cached marketing session data after the hint is gone', async () => {
    renderWithProviders(<NavWithCachedMarketingSession />);

    await waitFor(() => expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /dashboard/i })).toBeNull();
  });

  /**
   * The marketing HTML is static, so it is written before anyone knows who is
   * asking. While `me` is unanswered both answers must be present for CSS to
   * choose between before paint — emitting only the anonymous one is what left
   * a returning visitor looking at an empty actions row until React caught up.
   */
  it('carries both session answers in the markup until me has answered', async () => {
    let releaseMe!: () => void;
    const meSettled = new Promise<void>((resolve) => {
      releaseMe = resolve;
    });
    mswServer.use(
      http.get('/api/v1/auth/me', async () => {
        await meSettled;
        return new HttpResponse(null, { status: 401 });
      }),
    );
    document.cookie = `${SESSION_HINT_COOKIE}=1; path=/`;

    const { container } = renderWithProviders(<MarketingNav />);

    const returning = container.querySelector('[data-session-returning]');
    expect(container.querySelector('[data-session-anon]')).not.toBeNull();
    expect(returning?.querySelector('a')).toHaveAttribute('href', '/projects');

    releaseMe();
    await waitFor(() => expect(container.querySelector('[data-session-returning]')).toBeNull());
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
  });

  it('swaps the CTA for a dashboard link once the session resolves', async () => {
    stubSignedIn();
    document.cookie = `${SESSION_HINT_COOKIE}=1; path=/`;
    renderWithProviders(<MarketingNav />);

    // No projects yet, so the dashboard link routes into first-run onboarding.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
        'href',
        '/onboarding',
      ),
    );
    expect(screen.queryByRole('link', { name: /book a demo/i })).toBeNull();
  });

  /**
   * An unresolved project count is not evidence of an empty account, and the
   * two guesses are not symmetric: `/projects` is gated and redirects
   * authoritatively when the account really has none, whereas nothing corrects
   * a wrong trip to `/onboarding` — which is how someone ends up creating a
   * second project their plan does not allow.
   */
  it('sends an unresolved project count to the workspace, not to onboarding', async () => {
    mswServer.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'evaluator@example.com',
            role: 'user',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        }),
      ),
      http.get('/api/v1/projects', () => HttpResponse.json({ detail: 'boom' }, { status: 500 })),
    );
    document.cookie = `${SESSION_HINT_COOKIE}=1; path=/`;
    renderWithProviders(<MarketingNav />);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/projects'),
    );
  });
});
