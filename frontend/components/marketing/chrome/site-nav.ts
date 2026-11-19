/**
 * Behaviour for the server-rendered website navbar (`SiteNav.astro`).
 *
 * The markup is complete without this module: the mobile sheet is in the
 * initial HTML, hidden. This adds the sheet, its accordions and the homepage
 * logo with plain DOM listeners. The desktop menus are the `DesktopNav`
 * island, which also reads `routePath` and `inSection` from here.
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
  const desktop = window.matchMedia('(min-width: 960px)');
  const holdPage = () => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSheet();
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
    // The sheet is a dialog: focus moves in on open and back to the toggle
    // on close, unless the bar has widened and hidden the toggle.
    if (next) sheet.querySelector<HTMLElement>('a[href], button')?.focus();
    else if (!desktop.matches) toggle.focus();
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
  mountHomeLogo(chrome, mountSheet(chrome));
}
