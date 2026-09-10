'use client';

import { useQuery } from '@tanstack/react-query';
import { LogoMark } from '@/components/ui/logo-mark';
import { Menu, X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { fetchMarketingProjectCount, fetchMarketingSession } from '@/lib/api/marketing-session';
import { queryKeys } from '@/lib/api/query-keys';
import { DEMO_CTA, type NavDropKey } from '@/lib/marketing-content/nav';
import { ACTIVE_PROJECT_STORAGE_KEY } from '@/lib/project/active-project-storage';
import { cn } from '@/lib/utils';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { DesktopNavigation } from './nav-desktop';
import { MobileNavigation } from './nav-mobile';
import { RETURNING_VISITOR_ATTRIBUTE } from './returning-visitor-hint';

/** What asked for a dropdown: a resting pointer, or an explicit focus move. */
export type OpenSource = 'hover' | 'focus';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const COLUMN = 380;
const DROP_LAYOUT: Record<NavDropKey, { width: number; twoColumn: boolean }> = {
  platform: { width: COLUMN, twoColumn: false },
  solutions: { width: COLUMN, twoColumn: false },
  resources: { width: COLUMN, twoColumn: false },
};

const noStoredActiveProject = () => false;

function readStoredActiveProject(): boolean {
  try {
    return Boolean(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY));
  } catch {
    return false;
  }
}

function subscribeToStoredActiveProject(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTIVE_PROJECT_STORAGE_KEY && event.storageArea === window.localStorage) {
      onStoreChange();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

function useMarketingSession() {
  const hasStoredProject = useSyncExternalStore(
    subscribeToStoredActiveProject,
    readStoredActiveProject,
    noStoredActiveProject,
  );
  // Both queries go through `lib/api/marketing-session`, NOT the validated
  // `authApi` / `projectsApi`: those import the schema barrel, which put Zod
  // and every product schema (a measured 449 KB) into the marketing bundle to
  // answer two yes/no questions. See that module for why validation is the
  // right trade to drop here specifically.
  //
  // These use marketing-only cache keys. They hold a boolean and a count,
  // whereas `auth.me()` / `projects.list()` hold the validated user object and
  // project array that `SessionGuard` and `ProjectProvider` read fields off —
  // one `QueryClient` spans both surfaces with a 30-minute `gcTime`, so
  // sharing a key would hand the app shell the wrong shape on the first
  // navigation in from `/`.
  const me = useQuery({
    queryKey: queryKeys.auth.marketingSession(),
    queryFn: ({ signal }) => fetchMarketingSession({ signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const projects = useQuery({
    queryKey: queryKeys.projects.marketingCount(),
    queryFn: ({ signal }) => fetchMarketingProjectCount({ signal }),
    enabled: Boolean(me.data),
  });
  const hasProject = (projects.data ?? 0) > 0 || hasStoredProject;

  // Only once `me` has answered does React know what the actions row should
  // show, and only then may the pre-hydration mark go. Dropping it on mount
  // would hand the row back to CSS's anonymous default mid-flight — the exact
  // flash the mark exists to prevent — and keeping it forever would hide
  // "Log in" from a browser whose stored trace has outlived its session.
  const sessionSettled = !me.isPending;
  useEffect(() => {
    if (sessionSettled) document.documentElement.removeAttribute(RETURNING_VISITOR_ATTRIBUTE);
  }, [sessionSettled]);

  return {
    // Until `me` has settled (success or 401) we know nothing for certain about
    // the visitor, and rendering the anonymous actions during that window only
    // to swap in the dashboard link is the refresh flicker.
    //
    // Waiting on every visitor would cure that flicker by hiding the primary
    // CTA behind an auth round trip for the anonymous majority, who are the
    // people the marketing site exists for. So the placeholder is shown only
    // when this browser carries a trace of a previous session — the stored
    // active project — which is where the swap would actually have happened.
    // Everyone else gets "Log in" and the demo CTA in the first paint.
    sessionPending: me.isPending,
    isAuthenticated: Boolean(me.data),
    dashboardHref: hasProject ? '/projects' : '/onboarding',
  };
}

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return scrolled;
}

function useDesktopDropdown(reduceMotion: boolean | null) {
  const [openDrop, setOpenDrop] = useState<NavDropKey | null>(null);
  const [lens, setLens] = useState<{ left: number; width: number } | null>(null);
  const [panelLeft, setPanelLeft] = useState(0);
  const closeTimer = useRef<number | null>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  /**
   * Set when a trigger is chosen. The panel opens on hover, and clicking a
   * top-level trigger leaves the pointer sitting exactly where the trigger is.
   *
   * We suppress hover only for that specific trigger while the pointer rests
   * on it, avoiding instant re-opening. Moving to another trigger, leaving the
   * trigger, or focusing via keyboard clears the suppression.
   */
  const suppressedDrop = useRef<NavDropKey | null>(null);

  const clearDropClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeDrop = () => setOpenDrop(null);
  const selectDrop = (key?: NavDropKey) => {
    suppressedDrop.current = key ?? null;
    clearDropClose();
    setOpenDrop(null);
    setLens(null);
  };
  const releaseSuppression = (key?: NavDropKey) => {
    if (!key || suppressedDrop.current === key) {
      suppressedDrop.current = null;
    }
  };
  const scheduleDropClose = () => {
    clearDropClose();
    closeTimer.current = window.setTimeout(closeDrop, 220);
  };
  const moveLens = (element: HTMLElement) => {
    const container = linksRef.current;
    if (!container || reduceMotion) return;
    const trigger = element.getBoundingClientRect();
    const bounds = container.getBoundingClientRect();
    setLens({ left: trigger.left - bounds.left, width: trigger.width });
  };
  const openDropAt = (key: NavDropKey, trigger: HTMLElement, source: OpenSource = 'hover') => {
    const container = linksRef.current;
    const nav = navRef.current;
    if (!container || !nav) return;
    // Focus is an explicit request and always wins; only a resting pointer on
    // the just-selected trigger is suppressed. Moving to any other trigger or
    // focusing clears the suppression.
    if (source === 'focus') {
      suppressedDrop.current = null;
    } else if (suppressedDrop.current === key) {
      return;
    } else {
      suppressedDrop.current = null;
    }
    clearDropClose();
    setOpenDrop(key);
    moveLens(trigger);
    const triggerBox = trigger.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    const width = DROP_LAYOUT[key].width;
    const desired = triggerBox.left + triggerBox.width / 2 - width / 2;
    const left = Math.min(
      Math.max(desired, navBox.left),
      Math.max(navBox.right - width, navBox.left),
    );
    setPanelLeft(left - containerBox.left);
  };

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (openDrop === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeDrop();
      (document.activeElement as HTMLElement | null)?.blur();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openDrop]);

  return {
    openDrop,
    lens,
    panelLeft,
    linksRef,
    navRef,
    clearDropClose,
    closeDrop,
    selectDrop,
    releaseSuppression,
    scheduleDropClose,
    openDropAt,
    moveLens,
    clearLens: () => setLens(null),
  };
}

/** Fixed marketing chrome with accessible desktop dropdowns and mobile accordions. */
export function MarketingNav() {
  const reduceMotion = useReducedMotion();
  const { isAuthenticated, sessionPending, dashboardHref } = useMarketingSession();
  const scrolled = useScrolled();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openAcc, setOpenAcc] = useState<NavDropKey | null>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const {
    navRef,
    linksRef,
    openDrop,
    lens,
    panelLeft,
    clearDropClose,
    closeDrop,
    selectDrop,
    releaseSuppression,
    scheduleDropClose,
    openDropAt,
    moveLens,
    clearLens,
  } = useDesktopDropdown(reduceMotion);
  const surfaceVisible = scrolled || mobileOpen;
  const closeMenu = () => {
    setMobileOpen(false);
    setOpenAcc(null);
  };

  /**
   * Escape, and a tap anywhere outside the sheet, both close the menu.
   *
   * The outside-click listener is `pointerdown` on the document: `click` fires
   * after the sheet may already have re-rendered, and touch devices never send
   * a `blur` that would otherwise serve. The whole chrome element is the
   * boundary, not just the sheet — a tap on the toggle must reach the toggle's
   * own handler rather than being closed here and reopened by it.
   */
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    const onPointerDown = (event: PointerEvent) => {
      const chrome = chromeRef.current;
      if (chrome && !chrome.contains(event.target as Node | null)) closeMenu();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [mobileOpen]);

  return (
    <div
      ref={chromeRef}
      data-marketing-nav
      data-scrolled={scrolled ? 'true' : undefined}
      className={cn(
        'safe-top fixed inset-x-0 top-0 z-50 w-full max-w-full border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        surfaceVisible
          ? 'border-border-subtle bg-panel/80 backdrop-blur-md'
          : 'border-transparent bg-transparent',
      )}
    >
      <nav
        ref={navRef}
        aria-label="Main navigation"
        // Three tracks, not a flex row: the links sit in the middle track, so
        // their position is a function of the viewport alone. As a flex row
        // they were centred in whatever space the actions left over, and the
        // actions change width twice on a returning visitor's refresh (the
        // anonymous pair, then the pending placeholder, then Dashboard) — which
        // slid the whole navigation sideways each time. The side tracks are
        // `minmax(0,1fr)` so they stay exactly equal regardless of what either
        // one holds.
        className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-5 px-[var(--site-gutter)]"
      >
        <HomeLogoLink onNavigate={closeMenu} />

        <DesktopNavigation
          layout={DROP_LAYOUT}
          lens={lens}
          panelLeft={panelLeft}
          openDrop={openDrop}
          reduceMotion={reduceMotion}
          linksRef={linksRef}
          lensTransition={{ layout: { duration: 0.18, ease: EASE_OUT } }}
          clearDropClose={clearDropClose}
          scheduleDropClose={scheduleDropClose}
          closeDrop={closeDrop}
          selectDrop={selectDrop}
          releaseSuppression={releaseSuppression}
          openDropAt={openDropAt}
          moveLens={moveLens}
          clearLens={clearLens}
        />

        <NavActions
          isAuthenticated={isAuthenticated}
          sessionPending={sessionPending}
          dashboardHref={dashboardHref}
          mobileOpen={mobileOpen}
          onToggleMenu={() => setMobileOpen((open) => !open)}
        />
      </nav>

      {mobileOpen && (
        <MobileNavigation
          isAuthenticated={isAuthenticated}
          sessionPending={sessionPending}
          dashboardHref={dashboardHref}
          openAcc={openAcc}
          setOpenAcc={setOpenAcc}
          closeMenu={closeMenu}
        />
      )}
    </div>
  );
}

/**
 * The wordmark, which is the site's "go home" affordance.
 *
 * On every route but `/` this is an ordinary `Link`. On `/` itself it was one
 * too, and that was the bug: clicking the logo on the landing page navigated
 * from `/` to `/`, which the router correctly treats as a no-op, so the click
 * did nothing at all — the page did not move and the reader got no feedback.
 *
 * The convention it should follow is the one every site with a fixed header
 * uses: on the page you are already on, the logo takes you to the TOP of it.
 * `preventDefault` on the same-route case keeps the router out of it entirely,
 * and the scroll respects reduced motion. It stays a real `<a href="/">` so
 * middle-click, ctrl-click, and "open in new tab" behave, and so the link is
 * still a link to assistive tech.
 */
function HomeLogoLink({ onNavigate }: Readonly<{ onNavigate: () => void }>) {
  const reduceMotion = useReducedMotion();

  return (
    <Link
      href="/"
      aria-label="CiteLadder home"
      className="focus-ring inline-flex shrink-0 items-center rounded-xs"
      onClick={(event) => {
        onNavigate();
        // Read on click rather than through usePathname(): the path only decides
        // what this handler does, and subscribing re-rendered the logo on every
        // marketing navigation.
        if (window.location.pathname !== '/') return;
        // Modified clicks are the reader asking for a new tab/window; leave them
        // to the browser rather than swallowing them into a scroll.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      }}
    >
      <LogoMark priority />
    </Link>
  );
}

/** Log in and the demo CTA: what a visitor with no session is offered. */
function AnonymousActions() {
  return (
    <>
      <Link
        href="/login"
        className="website-nav text-muted hover:text-foreground inline-flex px-4 transition-colors"
      >
        Log in
      </Link>
      <DemoButtonLink variant="primary" className="hidden min-h-10 px-4 sm:inline-flex">
        {DEMO_CTA}
      </DemoButtonLink>
    </>
  );
}

function NavActions({
  isAuthenticated,
  sessionPending,
  dashboardHref,
  mobileOpen,
  onToggleMenu,
}: Readonly<{
  isAuthenticated: boolean;
  sessionPending: boolean;
  dashboardHref: string;
  mobileOpen: boolean;
  onToggleMenu: () => void;
}>) {
  return (
    <div className="flex shrink-0 items-center gap-3 justify-self-end">
      {sessionPending ? (
        // `me` has not answered yet, and this render is also the STATIC HTML —
        // so React cannot choose here without guessing. It emits both answers
        // and lets CSS pick before paint: `ReturningVisitorHint` marks the
        // document when this browser holds a stored project, and `globals.css`
        // shows the matching branch. The anonymous majority get "Log in" in
        // the first paint; someone returning gets Dashboard in the first
        // paint, instead of an empty row that fills in a moment later.
        <>
          <span data-session-anon>
            <AnonymousActions />
          </span>
          <span data-session-returning>
            <ButtonLink href="/projects" variant="primary" className="min-h-10 px-4">
              Dashboard
            </ButtonLink>
          </span>
        </>
      ) : isAuthenticated ? (
        // The topbar CTA runs one step smaller than the page CTAs — chrome,
        // not a section action.
        <ButtonLink href={dashboardHref} variant="primary" className="min-h-10 px-4">
          Dashboard
        </ButtonLink>
      ) : (
        <AnonymousActions />
      )}
      <button
        type="button"
        className="border-border-subtle text-foreground grid size-10 place-items-center rounded-[var(--radius-control)] border lg:hidden"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        aria-controls="mobile-menu"
        onClick={onToggleMenu}
      >
        {mobileOpen ? (
          <X className="size-4" aria-hidden />
        ) : (
          <Menu className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
