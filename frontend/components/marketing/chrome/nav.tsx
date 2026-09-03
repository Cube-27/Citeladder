'use client';

import { useQuery } from '@tanstack/react-query';
import { LogoMark } from '@/components/ui/logo-mark';
import { Menu, X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import Link from 'next/link';
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

  return {
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
   * Set when a row is chosen. The panel opens on hover, and picking a row
   * leaves the pointer sitting exactly where the trigger is — so `closeDrop`
   * alone closed the panel for one frame and the very next `mouseenter`
   * reopened it. The trigger stays suppressed until the pointer actually
   * leaves the navigation.
   *
   * It suppresses HOVER only. The problem it solves is a pointer that has not
   * moved; a keyboard user tabbing to the next trigger has, by definition,
   * asked for that panel, and gating focus on a flag that only a `mouseleave`
   * can clear would strand them with no dropdowns at all.
   */
  const suppressed = useRef(false);

  const clearDropClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeDrop = () => setOpenDrop(null);
  const selectDrop = () => {
    suppressed.current = true;
    clearDropClose();
    setOpenDrop(null);
    setLens(null);
  };
  const releaseSuppression = () => {
    suppressed.current = false;
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
    // Focus is an explicit request and always wins; only a resting pointer is
    // suppressed. Reaching a trigger by keyboard also clears the flag, so the
    // hover that follows behaves normally.
    if (source === 'focus') suppressed.current = false;
    else if (suppressed.current) return;
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
  const { isAuthenticated, dashboardHref } = useMarketingSession();
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
        'safe-top fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        surfaceVisible
          ? 'border-border-subtle bg-panel/80 backdrop-blur-md'
          : 'border-transparent bg-transparent',
      )}
    >
      <nav
        ref={navRef}
        aria-label="Main navigation"
        className="mx-auto flex h-16 w-full max-w-7xl items-center gap-5 px-[var(--site-gutter)]"
      >
        <Link href="/" aria-label="CiteLadder home" className="shrink-0">
          <LogoMark size={24} />
        </Link>

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
          dashboardHref={dashboardHref}
          mobileOpen={mobileOpen}
          onToggleMenu={() => setMobileOpen((open) => !open)}
        />
      </nav>

      {mobileOpen && (
        <MobileNavigation
          isAuthenticated={isAuthenticated}
          dashboardHref={dashboardHref}
          openAcc={openAcc}
          setOpenAcc={setOpenAcc}
          closeMenu={closeMenu}
        />
      )}
    </div>
  );
}

function NavActions({
  isAuthenticated,
  dashboardHref,
  mobileOpen,
  onToggleMenu,
}: Readonly<{
  isAuthenticated: boolean;
  dashboardHref: string;
  mobileOpen: boolean;
  onToggleMenu: () => void;
}>) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-3 lg:ml-0">
      {isAuthenticated ? (
        <ButtonLink href={dashboardHref} variant="primary">
          Dashboard
        </ButtonLink>
      ) : (
        <>
          <Link
            href="/login"
            className="website-nav text-muted hover:text-foreground hidden px-4 transition-colors sm:inline-flex"
          >
            Log in
          </Link>
          <DemoButtonLink variant="primary">{DEMO_CTA}</DemoButtonLink>
        </>
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
