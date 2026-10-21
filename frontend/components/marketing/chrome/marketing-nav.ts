import type { NavDropKey } from '@/lib/marketing-content/nav';

/**
 * Behaviour for the server-rendered marketing navigation (`MarketingNav.astro`).
 *
 * The markup is complete without this module: every dropdown panel and the
 * mobile sheet are in the initial HTML, hidden. This adds the hover-intent
 * desktop dropdowns, the mobile sheet and the scrolled surface with plain DOM
 * listeners, so content pages ship no framework runtime.
 */

/**
 * The route a request pathname names. The site builds with
 * `build.format: 'file'`, so a prerendered page sees `/index.html` or
 * `/pricing.html` where the browser shows `/` and `/pricing`; every
 * current-page and homepage check compares against the route form.
 */
export function routePath(pathname: string): string {
  let route = pathname.replace(/\.html$/, '').replace(/\/index$/, '');
  // Trailing slashes are trimmed by scanning, not a `/+$` pattern, which
  // backtracks on a long run of slashes.
  let end = route.length;
  while (end > 0 && route[end - 1] === '/') end -= 1;
  route = route.slice(0, end);
  return route === '' ? '/' : route;
}

/** Panel widths in px; the panel is centred under its trigger within the bar. */
export const DROP_LAYOUT: Readonly<Record<NavDropKey, { width: number }>> = {
  platform: { width: 820 },
  solutions: { width: 320 },
  resources: { width: 620 },
};

/** What asked for a dropdown: a resting pointer, or an explicit focus move. */
type OpenSource = 'hover' | 'focus';

/** Which side a switching panel arrives from: the side of the previous trigger. */
type SlideFrom = 'left' | 'right';

type PanelState = 'hidden' | 'entering' | 'open' | 'closing';

/**
 * Hover intent: a pointer must rest this long on a trigger before the first
 * panel opens, so sweeping across the bar does not flash menus. Once a panel
 * is open, moving to a neighbouring trigger switches immediately, and the
 * panels slide across in the pointer's direction instead of closing and
 * reopening.
 */
const HOVER_OPEN_DELAY_MS = 200;
/** Leaving the bar closes the open panel after this grace period. */
const HOVER_CLOSE_DELAY_MS = 220;
/** Matches the exit animation in globals.css (`marketing-nav-panel-out`). */
const PANEL_EXIT_MS = 170;
/** How far down the page the bar changes from transparent to a surface. */
const SCROLLED_THRESHOLD_PX = 10;

const PANEL_ANIMATIONS = [
  'marketing-nav-panel',
  'marketing-nav-panel-out',
  'marketing-nav-panel-slide',
  'marketing-nav-panel-slide-out',
];

function panelState(open: boolean, closing: boolean, entering: boolean): PanelState {
  if (open) return entering ? 'entering' : 'open';
  return closing ? 'closing' : 'hidden';
}

/** The animation a panel plays: unfold from a closed bar, or slide on handover. */
function panelAnimation(state: PanelState, slideFrom: SlideFrom | null): string | undefined {
  if (state === 'entering') return 'marketing-nav-panel';
  if (state === 'closing') {
    return slideFrom ? 'marketing-nav-panel-slide-out' : 'marketing-nav-panel-out';
  }
  return state === 'open' && slideFrom ? 'marketing-nav-panel-slide' : undefined;
}

function isDropKey(value: string | undefined): value is NavDropKey {
  return value !== undefined && value in DROP_LAYOUT;
}

function setOptionalAttribute(element: Element, name: string, value: string | undefined) {
  if (value === undefined) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

/**
 * Has the reader moved off the top of the page?
 *
 * Answered by watching a sentinel rather than by listening to scroll: an
 * IntersectionObserver reports only the crossings, off the main thread. The
 * bar is `position: fixed`, so it has no document position of its own to
 * observe; the sentinel also reports correctly for a reader who lands mid-page.
 */
function watchScrolled(chrome: HTMLElement) {
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.cssText = `position:absolute;top:${SCROLLED_THRESHOLD_PX}px;left:0;width:1px;height:1px;pointer-events:none;`;
  document.body.prepend(sentinel);
  new IntersectionObserver(([entry]) => {
    if (entry)
      setOptionalAttribute(chrome, 'data-scrolled', entry.isIntersecting ? undefined : 'true');
  }).observe(sentinel);
}

type DropElements = {
  key: NavDropKey;
  wrapper: HTMLElement;
  trigger: HTMLElement;
  panel: HTMLElement;
};

function dropElements(links: HTMLElement): DropElements[] {
  return [
    ...links.querySelectorAll<HTMLButtonElement>('button[id^="desktop-nav-trigger-"]'),
  ].flatMap((trigger) => {
    const key = trigger.id.slice('desktop-nav-trigger-'.length);
    const panel = document.getElementById(`desktop-nav-panel-${key}`);
    const wrapper = trigger.parentElement;
    return isDropKey(key) && panel && wrapper ? [{ key, wrapper, trigger, panel }] : [];
  });
}

/** Desktop links and the hover-intent dropdown panels they open. */
function mountDesktopDropdowns(nav: HTMLElement, links: HTMLElement) {
  const drops = dropElements(links);
  // The triggers' rendered order, so the slide direction follows what the reader sees.
  const order = drops.map((drop) => drop.key);

  let openDrop: NavDropKey | null = null;
  let openSource: OpenSource | null = null;
  let panelLeft = 0;
  /** Where the handed-over panel was, so it slides out from its own place. */
  let closingLeft = 0;
  /** The panel playing its exit animation; it is inert while it does. */
  let closingDrop: NavDropKey | null = null;
  /** Whether the open panel arrived from a closed bar (and so animates in). */
  let entering = false;
  /** Set while one open panel hands over to a neighbour's. */
  let slideFrom: SlideFrom | null = null;
  let closeTimer: number | null = null;
  let openTimer: number | null = null;
  let exitTimer: number | null = null;
  let returnFocus: HTMLElement | null = null;
  /**
   * Set when a trigger is chosen. Clicking a top-level trigger leaves the
   * pointer resting on it, so hover is suppressed for that trigger only until
   * the pointer moves to another trigger, leaves it, or focus moves.
   */
  let suppressedDrop: NavDropKey | null = null;

  const render = () => {
    for (const { key, trigger, panel } of drops) {
      const open = openDrop === key;
      const closing = closingDrop === key;
      const state = panelState(open, closing, entering);
      setOptionalAttribute(trigger, 'data-open', open ? 'true' : undefined);
      trigger.setAttribute('aria-expanded', String(open));
      panel.hidden = state === 'hidden';
      // A closing panel is still painted for its exit animation, but it is
      // already gone for assistive technology and pointer input.
      setOptionalAttribute(panel, 'aria-hidden', state === 'closing' ? 'true' : undefined);
      panel.inert = state === 'closing';
      panel.style.left = `${closing ? closingLeft : panelLeft}px`;
      setOptionalAttribute(panel, 'data-slide-from', slideFrom ?? undefined);
      const animation = panelAnimation(state, slideFrom);
      for (const name of PANEL_ANIMATIONS) {
        if (name !== animation) panel.classList.remove(name);
      }
      if (animation) panel.classList.add(animation);
    }
  };

  const clearDropClose = () => {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = null;
  };
  const cancelPendingOpen = () => {
    if (openTimer) window.clearTimeout(openTimer);
    openTimer = null;
  };
  const playExit = (key: NavDropKey | null) => {
    if (exitTimer) window.clearTimeout(exitTimer);
    closingDrop = key;
    if (key) {
      exitTimer = window.setTimeout(() => {
        closingDrop = null;
        render();
      }, PANEL_EXIT_MS);
    }
  };
  const closeDrop = () => {
    cancelPendingOpen();
    slideFrom = null;
    closingLeft = panelLeft;
    playExit(openDrop);
    openDrop = null;
    openSource = null;
    render();
  };
  /** Chosen a row or trigger: close and stay closed until the pointer moves away. */
  const selectDrop = (key?: NavDropKey) => {
    suppressedDrop = key ?? null;
    clearDropClose();
    cancelPendingOpen();
    playExit(null);
    openDrop = null;
    render();
  };
  const releaseSuppression = (key?: NavDropKey) => {
    if (!key || suppressedDrop === key) suppressedDrop = null;
  };
  const scheduleDropClose = () => {
    clearDropClose();
    cancelPendingOpen();
    closeTimer = window.setTimeout(closeDrop, HOVER_CLOSE_DELAY_MS);
  };
  const showDrop = (key: NavDropKey, trigger: HTMLElement, source: OpenSource) => {
    openTimer = null;
    const previous = openDrop;
    const switching = previous !== null && previous !== key;
    entering = previous === null;
    slideFrom = null;
    if (switching) slideFrom = order.indexOf(previous) < order.indexOf(key) ? 'left' : 'right';
    // A handed-over panel slides out from its own place while its neighbour
    // slides in; closing from the bar folds up where the panel already is.
    closingLeft = panelLeft;
    playExit(switching ? previous : null);
    openDrop = key;
    openSource = source;
    const triggerBox = trigger.getBoundingClientRect();
    const containerBox = links.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    const width = DROP_LAYOUT[key].width;
    const desired = triggerBox.left + triggerBox.width / 2 - width / 2;
    const left = Math.min(
      Math.max(desired, navBox.left),
      Math.max(navBox.right - width, navBox.left),
    );
    panelLeft = left - containerBox.left;
    render();
  };
  const openDropAt = (key: NavDropKey, trigger: HTMLElement, source: OpenSource = 'hover') => {
    // Focus is an explicit request and always wins; only a resting pointer on
    // the just-selected trigger is suppressed.
    if (source === 'focus') {
      suppressedDrop = null;
      returnFocus = trigger;
    } else if (suppressedDrop === key) {
      return;
    } else {
      suppressedDrop = null;
      returnFocus = drops.find((drop) => drop.key === key)?.trigger ?? null;
    }
    clearDropClose();
    cancelPendingOpen();
    if (source === 'hover' && openDrop === null) {
      openTimer = window.setTimeout(() => showDrop(key, trigger, source), HOVER_OPEN_DELAY_MS);
      return;
    }
    showDrop(key, trigger, source);
  };

  links.addEventListener('mouseenter', clearDropClose);
  links.addEventListener('mouseleave', () => {
    // Leaving the nav is what re-arms hover after a selection.
    releaseSuppression();
    scheduleDropClose();
  });
  links.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !links.contains(event.relatedTarget)) closeDrop();
  });

  for (const { key, wrapper, trigger, panel } of drops) {
    wrapper.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') openDropAt(key, wrapper);
    });
    wrapper.addEventListener('mouseleave', () => releaseSuppression(key));
    trigger.addEventListener('click', () => {
      // A click on a hover-opened panel pins it open instead of closing it.
      if (openDrop === key && openSource !== 'hover') closeDrop();
      else openDropAt(key, trigger, 'focus');
    });
    panel.addEventListener('mouseenter', clearDropClose);
    for (const row of panel.querySelectorAll('a')) {
      row.addEventListener('click', () => selectDrop());
    }
  }

  for (const link of links.querySelectorAll<HTMLAnchorElement>(':scope > a')) {
    link.addEventListener('click', () => selectDrop());
    link.addEventListener('mouseenter', () => {
      releaseSuppression();
      scheduleDropClose();
    });
    link.addEventListener('focus', () => {
      releaseSuppression();
      closeDrop();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (openDrop === null || event.key !== 'Escape') return;
    // A panel opened by hover must not pull focus out of a field elsewhere.
    if (nav.contains(document.activeElement)) returnFocus?.focus();
    clearDropClose();
    closeDrop();
  });
}

/**
 * The mobile sheet: a toggle, accordions, and the page behind it made inert.
 * Returns the function that closes it.
 */
function mountMobileSheet(chrome: HTMLElement) {
  const toggle = chrome.querySelector<HTMLButtonElement>('button[aria-controls="mobile-menu"]');
  const sheet = document.getElementById('mobile-menu');
  const sheetWrapper = sheet?.parentElement;
  const actions = chrome.querySelector<HTMLElement>('[data-nav-actions]');
  if (!toggle || !sheet || !sheetWrapper) return () => undefined;
  const openIcon = toggle.querySelector<SVGElement>('[data-icon="open"]');
  const closeIcon = toggle.querySelector<SVGElement>('[data-icon="close"]');
  const accordions = [
    ...sheet.querySelectorAll<HTMLButtonElement>('button[aria-controls^="acc-"]'),
  ].map((button) => {
    const key = button.getAttribute('aria-controls')?.slice('acc-'.length) ?? '';
    return { key, button, panel: document.getElementById(`acc-${key}`) };
  });

  let mobileOpen = false;
  let openAcc: string | null = null;
  let releasePage: (() => void) | null = null;

  const render = () => {
    chrome.classList.toggle('bg-panel', mobileOpen);
    chrome.classList.toggle('bg-transparent', !mobileOpen);
    // While the sheet is open it owns the account actions. Hidden in CSS so a
    // phone-width menu left open across a resize keeps the desktop actions.
    actions?.classList.toggle('max-lg:hidden', mobileOpen);
    toggle.setAttribute('aria-label', mobileOpen ? 'Close menu' : 'Open menu');
    toggle.setAttribute('aria-expanded', String(mobileOpen));
    openIcon?.toggleAttribute('hidden', mobileOpen);
    closeIcon?.toggleAttribute('hidden', !mobileOpen);
    sheetWrapper.hidden = !mobileOpen;
    for (const { key, button, panel } of accordions) {
      const expanded = openAcc === key;
      button.setAttribute('aria-expanded', String(expanded));
      button.querySelector('svg')?.classList.toggle('rotate-180', expanded);
      if (panel) panel.hidden = !expanded;
    }
  };

  /**
   * Escape, and a tap anywhere outside the chrome, both close the menu. The
   * whole chrome is the boundary, not just the sheet, so a tap on the toggle
   * reaches the toggle's own handler.
   */
  const holdPage = () => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeMenu();
      if (toggle.getClientRects().length) toggle.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !chrome.contains(event.target)) closeMenu();
    };
    // The sheet covers the page, so the page behind it leaves the tab order
    // and the accessibility tree until the sheet closes.
    const hidden = [...document.body.children].filter(
      (element) => !element.contains(chrome) && !element.hasAttribute('inert'),
    );
    for (const element of hidden) element.setAttribute('inert', '');
    // The sheet is `lg:hidden`: widening the window past it closes the menu,
    // or the page would stay inert behind a sheet nobody can see.
    const desktop = window.matchMedia('(min-width: 64rem)');
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenu();
    };
    desktop.addEventListener('change', onDesktop);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      desktop.removeEventListener('change', onDesktop);
      for (const element of hidden) element.removeAttribute('inert');
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  };

  const setMobileOpen = (next: boolean) => {
    if (next === mobileOpen) return;
    mobileOpen = next;
    releasePage?.();
    releasePage = next ? holdPage() : null;
    render();
  };
  const closeMenu = () => {
    openAcc = null;
    if (mobileOpen) setMobileOpen(false);
    else render();
  };

  toggle.addEventListener('click', () => setMobileOpen(!mobileOpen));
  for (const { key, button } of accordions) {
    button.addEventListener('click', () => {
      openAcc = openAcc === key ? null : key;
      render();
    });
  }
  for (const link of sheet.querySelectorAll('a')) link.addEventListener('click', closeMenu);
  return closeMenu;
}

/**
 * The wordmark: on the page you are already on it scrolls to the top rather
 * than navigating `/` to `/`. It stays a real link, so modified clicks open a
 * new tab as usual.
 */
function mountHomeLogo(chrome: HTMLElement, closeMenu: () => void) {
  const logo = chrome.querySelector<HTMLAnchorElement>('a[aria-label="CiteLadder home"]');
  logo?.addEventListener('click', (event) => {
    closeMenu();
    if (window.location.pathname !== '/') return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
}

/** Where a closed announcement is remembered, by the announcement's id. */
const DISMISSED_ANNOUNCEMENT_KEY = 'citeladder.dismissed-announcement';

/**
 * The homepage announcement strip: its close button removes it, and the
 * visitor's browser remembers which announcement was closed, so the next
 * announcement (a new id) still shows. Storage can be unavailable (a private
 * window, blocked site data); the strip then simply shows on every visit.
 */
function mountAnnouncement(chrome: HTMLElement) {
  const strip = chrome.querySelector<HTMLElement>('[data-announcement]');
  const id = strip?.dataset.announcement;
  if (!strip || !id) return;
  if (readDismissedAnnouncement() === id) {
    strip.remove();
    return;
  }
  strip.querySelector('[data-announcement-close]')?.addEventListener('click', () => {
    strip.remove();
    // The closed button took focus with it; hand focus to the bar's first stop.
    chrome.querySelector<HTMLAnchorElement>('a[aria-label="CiteLadder home"]')?.focus();
    try {
      window.localStorage.setItem(DISMISSED_ANNOUNCEMENT_KEY, id);
    } catch {
      // Not remembered: the strip returns on the next visit.
    }
  });
}

function readDismissedAnnouncement(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_ANNOUNCEMENT_KEY);
  } catch {
    return null;
  }
}

/** Attach the navigation's behaviour to its server-rendered markup. */
export function mountMarketingNav(chrome: HTMLElement) {
  const nav = chrome.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
  const links = chrome.querySelector<HTMLElement>('[data-nav-links]');
  mountAnnouncement(chrome);
  watchScrolled(chrome);
  if (nav && links) mountDesktopDropdowns(nav, links);
  mountHomeLogo(chrome, mountMobileSheet(chrome));
}
