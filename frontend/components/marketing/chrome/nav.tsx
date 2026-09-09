'use client';

import { useQuery } from '@tanstack/react-query';
import { LogoMark } from '@/components/ui/logo-mark';
import { Menu, X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { authApi } from '@/lib/api/auth';
import { projectsApi } from '@/lib/api/projects';
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
  const me = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: ({ signal }) => authApi.me({ signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const projects = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: ({ signal }) => projectsApi.listProjects({ signal }),
    enabled: Boolean(me.data),
  });
  const hasProject = (projects.data?.length ?? 0) > 0 || hasStoredProject;

  // From here React decides what the actions row shows, so the pre-hydration
  // mark (see `ReturningVisitorHint`) has done its job. Dropping it is what
  // lets a stale trace fall back to the anonymous actions after a 401.
  useEffect(() => {
    document.documentElement.removeAttribute(RETURNING_VISITOR_ATTRIBUTE);
  }, []);

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
    sessionPending: me.isPending && hasStoredProject,
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
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <Link
      href="/"
      aria-label="CiteLadder home"
      className="focus-ring inline-flex shrink-0 items-center rounded-xs"
      onClick={(event) => {
        onNavigate();
        if (pathname !== '/') return;
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
        // A returning visitor whose session has not resolved yet: hold the
        // Dashboard link's own footprint rather than flash the anonymous
        // actions and swap them a moment later. It carries the SAME label and
        // the same classes as the real link, hidden from view and from
        // assistive tech, so the swap cannot change the row's width by a pixel.
        <ButtonLink
          href={dashboardHref}
          variant="primary"
          className="pointer-events-none min-h-10 px-4 opacity-0"
          aria-hidden
          tabIndex={-1}
        >
          Dashboard
        </ButtonLink>
      ) : isAuthenticated ? (
        // The topbar CTA runs one step smaller than the page CTAs — chrome,
        // not a section action.
        <ButtonLink href={dashboardHref} variant="primary" className="min-h-10 px-4">
          Dashboard
        </ButtonLink>
      ) : (
        // `data-session-anon`: hidden before hydration for a returning
        // visitor (see `ReturningVisitorHint`). `contents` keeps the row's
        // flex layout as if the wrapper were not there.
        <span data-session-anon className="contents">
          <Link
            href="/login"
            className="website-nav text-muted hover:text-foreground inline-flex px-4 transition-colors"
          >
            Log in
          </Link>
          <DemoButtonLink variant="primary" className="hidden min-h-10 px-4 sm:inline-flex">
            {DEMO_CTA}
          </DemoButtonLink>
        </span>
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
