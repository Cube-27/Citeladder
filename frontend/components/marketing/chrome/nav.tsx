'use client';

import { LogoMark } from '@/components/ui/logo-mark';
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { type NavDropKey } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

import { ButtonLink } from '../primitives/button';
import { DesktopNavigation } from './nav-desktop';
import { MobileNavigation } from './nav-mobile';
import { appHref } from '@/lib/config/app-link';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';

/** What asked for a dropdown: a resting pointer, or an explicit focus move. */
export type OpenSource = 'hover' | 'focus';

const DROP_LAYOUT: Record<NavDropKey, { width: number }> = {
  platform: { width: 820 },
  solutions: { width: 320 },
  resources: { width: 620 },
};

/**
 * Hover intent: a pointer must rest this long on a trigger before the first
 * panel opens, so sweeping across the bar does not flash menus. Once a panel
 * is open, moving to a neighbouring trigger switches immediately, and the
 * panels slide across in the pointer's direction instead of closing and
 * reopening.
 */
const HOVER_OPEN_DELAY_MS = 200;

/** Which side a switching panel arrives from: the side of the previous trigger. */
export type SlideFrom = 'left' | 'right';

const DROP_ORDER = Object.keys(DROP_LAYOUT) as NavDropKey[];
/** Matches the exit animation in globals.css (`marketing-nav-panel-out`). */
const PANEL_EXIT_MS = 170;

/** How far down the page the bar changes from transparent to a surface. */
const SCROLLED_THRESHOLD_PX = 10;

/**
 * Has the reader moved off the top of the page?
 *
 * Answered by watching a sentinel rather than by listening to scroll. The
 * listener ran at input frequency and read `window.scrollY` — a layout
 * property — on the main thread every time, to answer a question whose answer
 * changes about twice a visit. An IntersectionObserver reports only the
 * crossings, and does the watching off the main thread.
 *
 * The sentinel is created here rather than rendered because the bar itself is
 * `position: fixed`: it has no position in the document to observe. Its
 * position also means the observer reports correctly for a reader who lands
 * mid-page, which a one-shot `scrollY` read on mount would have to special-case.
 *
 * No feature check: `IntersectionObserver` predates every browser in the
 * support matrix `package.json` declares. The test environment installs a
 * drivable stub (`test/intersection-observer.ts`).
 */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = `position:absolute;top:${SCROLLED_THRESHOLD_PX}px;left:0;width:1px;height:1px;pointer-events:none;`;
    document.body.prepend(sentinel);

    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      sentinel.remove();
    };
  }, []);

  return scrolled;
}

function useDesktopDropdown() {
  const [openDrop, setOpenDropState] = useState<NavDropKey | null>(null);
  /** Mirrors `openDrop` so timer and key handlers read the current panel. */
  const openDropRef = useRef<NavDropKey | null>(null);
  const setOpenDrop = (key: NavDropKey | null) => {
    openDropRef.current = key;
    setOpenDropState(key);
  };
  const [openSource, setOpenSource] = useState<OpenSource | null>(null);
  const [panelLeft, setPanelLeft] = useState(0);
  const panelLeftRef = useRef(0);
  /** Where the handed-over panel was, so it slides out from its own place. */
  const [closingLeft, setClosingLeft] = useState(0);
  /** The panel playing its exit animation; it is inert while it does. */
  const [closingDrop, setClosingDrop] = useState<NavDropKey | null>(null);
  /** Whether the open panel arrived from a closed bar (and so animates in). */
  const [entering, setEntering] = useState(false);
  /** Set while one open panel hands over to a neighbour's. */
  const [slideFrom, setSlideFrom] = useState<SlideFrom | null>(null);
  const closeTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);
  const exitTimer = useRef<number | null>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
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
  const cancelPendingOpen = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = null;
  };
  const playExit = (key: NavDropKey | null) => {
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
    setClosingDrop(key);
    if (key) exitTimer.current = window.setTimeout(() => setClosingDrop(null), PANEL_EXIT_MS);
  };
  const closeDrop = () => {
    cancelPendingOpen();
    setSlideFrom(null);
    setClosingLeft(panelLeftRef.current);
    playExit(openDropRef.current);
    setOpenDrop(null);
    setOpenSource(null);
  };
  const selectDrop = (key?: NavDropKey) => {
    suppressedDrop.current = key ?? null;
    clearDropClose();
    cancelPendingOpen();
    playExit(null);
    setOpenDrop(null);
  };
  const releaseSuppression = (key?: NavDropKey) => {
    if (!key || suppressedDrop.current === key) {
      suppressedDrop.current = null;
    }
  };
  const scheduleDropClose = () => {
    clearDropClose();
    cancelPendingOpen();
    closeTimer.current = window.setTimeout(closeDrop, 220);
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
      returnFocus.current = trigger;
    } else if (suppressedDrop.current === key) {
      return;
    } else {
      suppressedDrop.current = null;
      returnFocus.current = document.getElementById(`desktop-nav-trigger-${key}`);
    }
    clearDropClose();
    cancelPendingOpen();
    if (source === 'hover' && openDropRef.current === null) {
      openTimer.current = window.setTimeout(
        () => showDrop(key, trigger, source),
        HOVER_OPEN_DELAY_MS,
      );
      return;
    }
    showDrop(key, trigger, source);
  };
  const showDrop = (key: NavDropKey, trigger: HTMLElement, source: OpenSource) => {
    const container = linksRef.current;
    const nav = navRef.current;
    if (!container || !nav) return;
    openTimer.current = null;
    const previous = openDropRef.current;
    const switching = previous !== null && previous !== key;
    setEntering(previous === null);
    setSlideFrom(
      switching
        ? DROP_ORDER.indexOf(previous) < DROP_ORDER.indexOf(key)
          ? 'left'
          : 'right'
        : null,
    );
    // A handed-over panel slides out from its own place while its neighbour
    // slides in; closing from the bar folds up where the panel already is.
    setClosingLeft(panelLeftRef.current);
    playExit(switching ? previous : null);
    setOpenDrop(key);
    setOpenSource(source);
    const triggerBox = trigger.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    const width = DROP_LAYOUT[key].width;
    const desired = triggerBox.left + triggerBox.width / 2 - width / 2;
    const left = Math.min(
      Math.max(desired, navBox.left),
      Math.max(navBox.right - width, navBox.left),
    );
    panelLeftRef.current = left - containerBox.left;
    setPanelLeft(panelLeftRef.current);
  };

  useEffect(
    () => () => {
      for (const timer of [closeTimer, openTimer, exitTimer]) {
        if (timer.current) window.clearTimeout(timer.current);
      }
    },
    [],
  );
  useEffect(() => {
    if (openDrop === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      returnFocus.current?.focus();
      clearDropClose();
      closeDrop();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openDrop]);

  return {
    openDrop,
    openSource,
    closingDrop,
    closingLeft,
    entering,
    slideFrom,
    panelLeft,
    linksRef,
    navRef,
    clearDropClose,
    closeDrop,
    selectDrop,
    releaseSuppression,
    scheduleDropClose,
    openDropAt,
  };
}

/** Fixed marketing chrome with accessible desktop dropdowns and mobile accordions. */
export function MarketingNav() {
  const scrolled = useScrolled();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openAcc, setOpenAcc] = useState<NavDropKey | null>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const {
    navRef,
    linksRef,
    openDrop,
    openSource,
    closingDrop,
    closingLeft,
    entering,
    slideFrom,
    panelLeft,
    clearDropClose,
    closeDrop,
    selectDrop,
    releaseSuppression,
    scheduleDropClose,
    openDropAt,
  } = useDesktopDropdown();
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
      if (event.key === 'Escape') {
        closeMenu();
        const toggle = chromeRef.current?.querySelector<HTMLButtonElement>(
          'button[aria-controls="mobile-menu"]',
        );
        if (toggle?.getClientRects().length) toggle.focus();
      }
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
      // Opaque rather than blurred. A live `backdrop-filter` on a fixed,
      // full-width strip re-samples and re-blurs whatever is behind it on
      // every scrolled frame — and this one also TRANSITIONED the filter, so
      // crossing the threshold animated the blur radius and invalidated every
      // cached blur for 300ms, at exactly the moment the reader started
      // moving. At 95% the "content passes underneath" reading survives.
      className={cn(
        'safe-top fixed inset-x-0 top-0 z-50 w-full max-w-full transition-[background-color,box-shadow] duration-300',
        mobileOpen ? 'bg-panel' : 'bg-transparent',
      )}
    >
      <nav
        ref={navRef}
        aria-label="Main navigation"
        // Three tracks from `lg` up: the links sit in the middle track, so their
        // position depends on the viewport alone, not on the width of the
        // account actions (which change once a returning visitor's session
        // resolves). Below `lg` the links are hidden and two items want two
        // ends, so it is a plain row.
        className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-[var(--site-gutter)] lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      >
        <HomeLogoLink onNavigate={closeMenu} />

        <DesktopNavigation
          layout={DROP_LAYOUT}
          panelLeft={panelLeft}
          openDrop={openDrop}
          openSource={openSource}
          closingDrop={closingDrop}
          closingLeft={closingLeft}
          entering={entering}
          slideFrom={slideFrom}
          linksRef={linksRef}
          clearDropClose={clearDropClose}
          scheduleDropClose={scheduleDropClose}
          closeDrop={closeDrop}
          selectDrop={selectDrop}
          releaseSuppression={releaseSuppression}
          openDropAt={openDropAt}
        />

        <NavActions mobileOpen={mobileOpen} onToggleMenu={() => setMobileOpen((open) => !open)} />
      </nav>

      <div hidden={!mobileOpen}>
        <MobileNavigation openAcc={openAcc} setOpenAcc={setOpenAcc} closeMenu={closeMenu} />
      </div>
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
  return (
    <a
      href="/"
      aria-label="CiteLadder home"
      className="focus-ring inline-flex shrink-0 items-center justify-self-start rounded-xs"
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
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      }}
    >
      <LogoMark priority />
    </a>
  );
}

/** The app's two account entry points: nothing else competes in the bar. */
function ProductActions() {
  return (
    <>
      <a
        href={appHref('/login')}
        className="nav-link website-nav rounded-[var(--radius-marketing-control)] px-3 py-2"
      >
        Log in
      </a>
      {selfServeSignupOpen() ? (
        <ButtonLink href={appHref('/register')} className="hidden sm:inline-flex">
          Sign up
        </ButtonLink>
      ) : null}
    </>
  );
}

function NavActions({
  mobileOpen,
  onToggleMenu,
}: Readonly<{
  mobileOpen: boolean;
  onToggleMenu: () => void;
}>) {
  return (
    <div className="flex shrink-0 items-center gap-2 justify-self-end">
      {/* While the sheet is open it owns the account actions. Hiding the header account
          control keeps the close button clear of a second account affordance. Hidden in
          CSS rather than unmounted so a phone-width menu left open across a
          resize to desktop, where the sheet itself is `lg:hidden`, does not
          take the desktop actions down with it. */}
      <div className={cn('flex items-center gap-2', mobileOpen && 'max-lg:hidden')}>
        <ProductActions />
      </div>
      <button
        type="button"
        className="text-foreground hover:bg-background-alt grid size-10 place-items-center rounded-[var(--radius-marketing-control)] lg:hidden"
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
