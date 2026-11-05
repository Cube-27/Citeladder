/**
 * Behaviour for the server-rendered website navbar (`SiteNav.astro`).
 *
 * The markup is complete without this module: every mega menu and the mobile
 * sheet are in the initial HTML, hidden. This adds hover-intent menus, the
 * mobile sheet and its accordions with plain DOM listeners, so content pages
 * ship no framework runtime for the navigation.
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

/** Is `href` the current route, or the section the current route sits in? */
export function inSection(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

/**
 * Hover intent: a pointer must rest this long on a trigger before the first
 * menu opens, so sweeping across the bar does not flash menus. Once one is
 * open, moving to a neighbouring trigger switches at once.
 */
const HOVER_OPEN_DELAY_MS = 200;
/** Leaving the navbar closes the open menu after this grace period. */
const HOVER_CLOSE_DELAY_MS = 220;

/** What asked for a menu: a resting pointer, or an explicit click or focus. */
type OpenSource = 'hover' | 'focus';

type Drop = { key: string; trigger: HTMLButtonElement; panel: HTMLElement };

const TRIGGER_PREFIX = 'desktop-nav-trigger-';

function drops(bar: HTMLElement): Drop[] {
  return [...bar.querySelectorAll<HTMLButtonElement>(`button[id^="${TRIGGER_PREFIX}"]`)].flatMap(
    (trigger) => {
      const key = trigger.id.slice(TRIGGER_PREFIX.length);
      const panel = document.getElementById(`desktop-nav-panel-${key}`);
      return panel ? [{ key, trigger, panel }] : [];
    },
  );
}

/** The desktop triggers and the mega menus under the bar. */
function mountMenus(anchor: HTMLElement, bar: HTMLElement) {
  const all = drops(bar);
  let open: Drop | null = null;
  let source: OpenSource | null = null;
  let openTimer: number | undefined;
  let closeTimer: number | undefined;
  /**
   * Set when a trigger or row is chosen. A click leaves the pointer resting on
   * the trigger, so hover is ignored for it until the pointer leaves it.
   */
  let suppressed: Drop | null = null;

  const render = () => {
    for (const drop of all) {
      const expanded = drop === open;
      drop.trigger.setAttribute('aria-expanded', String(expanded));
      drop.panel.hidden = !expanded;
    }
  };
  const clearTimers = () => {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
  };
  const close = () => {
    clearTimers();
    open = null;
    source = null;
    render();
  };
  const show = (drop: Drop, from: OpenSource) => {
    clearTimers();
    open = drop;
    source = from;
    render();
  };
  const hoverOpen = (drop: Drop) => {
    if (suppressed === drop || open === drop) {
      window.clearTimeout(closeTimer);
      return;
    }
    suppressed = null;
    clearTimers();
    // The first menu waits for a resting pointer; a neighbour switches at once.
    if (open) show(drop, 'hover');
    else openTimer = window.setTimeout(() => show(drop, 'hover'), HOVER_OPEN_DELAY_MS);
  };
  const scheduleClose = () => {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(close, HOVER_CLOSE_DELAY_MS);
  };

  for (const drop of all) {
    const item = drop.trigger.parentElement ?? drop.trigger;
    item.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') hoverOpen(drop);
    });
    item.addEventListener('pointerleave', () => {
      if (suppressed === drop) suppressed = null;
    });
    drop.trigger.addEventListener('click', () => {
      // A click on a hover-opened menu pins it open; a second click closes it.
      if (open === drop && source !== 'hover') {
        suppressed = drop;
        close();
      } else show(drop, 'focus');
    });
    drop.panel.addEventListener('pointerenter', () => window.clearTimeout(closeTimer));
    for (const row of drop.panel.querySelectorAll('a')) {
      row.addEventListener('click', () => {
        suppressed = open;
        close();
      });
    }
  }
  // The plain top-level links (Enterprise, Pricing), not the rows inside a menu.
  for (const link of bar.querySelectorAll<HTMLAnchorElement>('.cl-navbar-links > li > a')) {
    link.addEventListener('pointerenter', scheduleClose);
    link.addEventListener('focus', close);
  }

  anchor.addEventListener('pointerleave', () => {
    suppressed = null;
    scheduleClose();
  });
  anchor.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !anchor.contains(event.relatedTarget)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (!open || event.key !== 'Escape') return;
    const trigger = open.trigger;
    // A menu opened by hover must not pull focus out of a field elsewhere.
    if (anchor.contains(document.activeElement)) trigger.focus();
    close();
  });
}

/**
 * The mobile sheet: a toggle, accordions, and the page behind it made inert.
 * Returns the function that closes it.
 */
function mountSheet(chrome: HTMLElement) {
  const toggle = chrome.querySelector<HTMLButtonElement>('button[aria-controls="mobile-menu"]');
  const sheet = document.getElementById('mobile-menu');
  if (!toggle || !sheet) return () => undefined;
  const openIcon = toggle.querySelector('[data-icon-open]');
  const closeIcon = toggle.querySelector('[data-icon-close]');
  const accordions = [
    ...sheet.querySelectorAll<HTMLButtonElement>('button[aria-controls^="acc-"]'),
  ].map((button) => ({
    button,
    panel: document.getElementById(button.getAttribute('aria-controls') ?? ''),
  }));

  let isOpen = false;
  let openAccordion: HTMLButtonElement | null = null;
  let releasePage: (() => void) | null = null;

  const render = () => {
    toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    toggle.setAttribute('aria-expanded', String(isOpen));
    openIcon?.toggleAttribute('hidden', isOpen);
    closeIcon?.toggleAttribute('hidden', !isOpen);
    sheet.hidden = !isOpen;
    for (const { button, panel } of accordions) {
      const expanded = button === openAccordion;
      button.setAttribute('aria-expanded', String(expanded));
      if (panel) panel.hidden = !expanded;
    }
  };

  /**
   * Escape, and a tap anywhere outside the navbar, both close the sheet. The
   * whole navbar is the boundary, so a tap on the toggle reaches its own
   * handler.
   */
  const holdPage = () => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeSheet();
      if (toggle.getClientRects().length) toggle.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !chrome.contains(event.target)) closeSheet();
    };
    // The page behind the sheet leaves the tab order and the accessibility
    // tree until the sheet closes.
    const held = [...document.body.children].filter(
      (element) => !element.contains(chrome) && !element.hasAttribute('inert'),
    );
    for (const element of held) element.setAttribute('inert', '');
    // Widening past the sheet's breakpoint closes it, or the page would stay
    // inert behind a sheet nobody can see.
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) closeSheet();
    };
    desktop.addEventListener('change', onDesktop);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      desktop.removeEventListener('change', onDesktop);
      for (const element of held) element.removeAttribute('inert');
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  };

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    isOpen = next;
    releasePage?.();
    releasePage = next ? holdPage() : null;
    render();
  };
  const closeSheet = () => {
    openAccordion = null;
    if (isOpen) setOpen(false);
    else render();
  };

  toggle.addEventListener('click', () => setOpen(!isOpen));
  for (const { button } of accordions) {
    button.addEventListener('click', () => {
      openAccordion = openAccordion === button ? null : button;
      render();
    });
  }
  for (const link of sheet.querySelectorAll('a')) link.addEventListener('click', closeSheet);
  return closeSheet;
}

/**
 * The logo on the homepage scrolls to the top rather than navigating `/` to
 * `/`. It stays a real link, so modified clicks open a new tab as usual.
 */
function mountHomeLogo(chrome: HTMLElement, closeSheet: () => void) {
  const logo = chrome.querySelector<HTMLAnchorElement>('a[aria-label="CiteLadder home"]');
  logo?.addEventListener('click', (event) => {
    closeSheet();
    if (routePath(window.location.pathname) !== '/') return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
}

/** Attach the navbar's behaviour to its server-rendered markup. */
export function mountSiteNav(chrome: HTMLElement) {
  const anchor = chrome.querySelector<HTMLElement>('.cl-navbar-anchor');
  const bar = chrome.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
  if (anchor && bar) mountMenus(anchor, bar);
  mountHomeLogo(chrome, mountSheet(chrome));
}
