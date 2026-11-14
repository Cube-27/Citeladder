/**
 * The Toc's scrollspy: marks the link of the heading in view, the last one
 * whose top has passed the reading line (a third down the viewport, or the
 * heading's scroll-margin-top, where a jump lands it, when that is lower),
 * or the last heading once the content holding it has ended in view or the
 * page is scrolled to its end. A Toc link that is followed marks its own
 * entry until the reader next scrolls, even when a short section lets the
 * heading after it cross the line too. A JumpMenu holding a Toc names that heading in
 * its summary ("On this page: Setup"). IntersectionObserver reports the
 * crossings, so scrolling itself reads no layout; a rail that scrolls on its
 * own (`data-toc-scroll`, or the Toc's list inside it) brings the marked link
 * into view, again once a resize shows it.
 */
const linkId = (link: HTMLAnchorElement) => decodeURIComponent(link.hash.slice(1));

/** Keys that scroll the page, so they end a followed link's hold on the mark. */
const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);

/** Scrolls the rail's scroller (its Toc list, or the rail) just enough to show the marked link. */
function reveal(link: HTMLAnchorElement) {
  const rail = link.closest<HTMLElement>('[data-toc-scroll]');
  if (!rail) return;
  const list = link.closest<HTMLElement>('.cl-toc-list');
  const scroller = list && list.scrollHeight > list.clientHeight ? list : rail;
  if (scroller.scrollHeight <= scroller.clientHeight) return;
  const box = scroller.getBoundingClientRect();
  const item = link.getBoundingClientRect();
  // Keep clear of the scroller's edge shades.
  const shade = 16;
  if (item.top < box.top + shade) scroller.scrollTop -= box.top + shade - item.top;
  else if (item.bottom > box.bottom - shade) scroller.scrollTop += item.bottom - box.bottom + shade;
}

export function mountTocSpy(root: Document = document): void {
  const view = root.defaultView;
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.cl-toc-link')];
  const headings = [...new Set(links.map(linkId))]
    .map((id) => root.getElementById(id))
    .filter((node): node is HTMLElement => node !== null);
  const first = headings[0];
  if (!view || !first) return;

  // The JumpMenus that hold a Toc, with the summary each shows on its own.
  const jumps = [...root.querySelectorAll<HTMLElement>('[data-jump]')].flatMap((jump) => {
    const label = jump.querySelector<HTMLElement>('.cl-jump-label');
    if (!label || !jump.querySelector('.cl-toc')) return [];
    return [{ label, name: label.textContent?.trim() ?? '' }];
  });

  const reached = new Set<Element>();
  let atEnd = false;
  let contentEnded = false;
  let followed: HTMLElement | undefined;
  // A resize can show a rail that was hidden when its link was marked.
  let revealDue = false;
  const mark = () => {
    let current = followed;
    if (!current && (atEnd || contentEnded)) current = headings.at(-1);
    current ??= headings.filter((h) => reached.has(h)).at(-1) ?? first;
    for (const link of links) {
      if (linkId(link) !== current?.id) {
        link.removeAttribute('aria-current');
        continue;
      }
      if (link.getAttribute('aria-current') === 'location' && !revealDue) continue;
      link.setAttribute('aria-current', 'location');
      reveal(link);
    }
    revealDue = false;
    const section = links.find((link) => linkId(link) === current?.id)?.textContent?.trim();
    for (const { label, name } of jumps) label.textContent = section ? `${name}: ${section}` : name;
  };

  // The observed band runs from far above the page down to the reading line,
  // so a heading is in it exactly when its top has passed that line.
  let headingObserver: IntersectionObserver | undefined;
  let contentObserver: IntersectionObserver | undefined;
  const content = headings.at(-1)?.parentElement;
  const observeHeadings = () => {
    headingObserver?.disconnect();
    contentObserver?.disconnect();
    // scroll-margin-top already clears the top bar.
    const line = Math.max(
      view.innerHeight / 3,
      Number.parseFloat(view.getComputedStyle(first).scrollMarginTop) || 0,
    );
    const below = Math.max(0, Math.floor(view.innerHeight - line - 1));
    headingObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reached.add(entry.target);
          else reached.delete(entry.target);
        }
        mark();
      },
      { rootMargin: `100000% 0px -${below}px 0px` },
    );
    for (const heading of headings) headingObserver.observe(heading);
    // A 1px band on the viewport's bottom edge: the content holding the last
    // heading has ended in view once its bottom has risen above that band, so
    // a short final section is marked before the page's own end.
    if (!content) return;
    contentObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const edge = entry.rootBounds?.top ?? view.innerHeight;
          contentEnded =
            view.scrollY > 0 && !entry.isIntersecting && entry.boundingClientRect.bottom <= edge;
        }
        mark();
      },
      { rootMargin: `-${Math.max(0, Math.floor(view.innerHeight - 1))}px 0px 0px 0px` },
    );
    contentObserver.observe(content);
  };

  const end = root.createElement('div');
  end.setAttribute('aria-hidden', 'true');
  root.body.append(end);
  // The 4px of slack lets a fractional final scroll position still count as the end.
  new IntersectionObserver(
    (entries) => {
      atEnd = entries.some((entry) => entry.isIntersecting) && view.scrollY > 0;
      mark();
    },
    { rootMargin: '0px 0px 4px 0px' },
  ).observe(end);

  // Back at the top nothing has ended, even when the content's foot never
  // crossed the band on the way up, so no observer reported it.
  view.addEventListener(
    'scroll',
    () => {
      if (view.scrollY > 0 || !(atEnd || contentEnded)) return;
      atEnd = false;
      contentEnded = false;
      mark();
    },
    { passive: true },
  );

  for (const link of links) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      followed = headings.find((heading) => heading.id === linkId(link));
      mark();
    });
  }
  const release = () => {
    if (!followed) return;
    followed = undefined;
    mark();
  };
  for (const type of ['wheel', 'touchstart', 'pointerdown'] as const) {
    view.addEventListener(type, release, { passive: true });
  }
  view.addEventListener('keydown', (event) => {
    if (SCROLL_KEYS.has(event.key)) release();
  });

  observeHeadings();
  view.addEventListener('resize', () => {
    revealDue = true;
    observeHeadings();
  });
  mark();
}
