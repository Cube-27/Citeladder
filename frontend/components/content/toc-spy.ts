/**
 * The Toc's scrollspy: marks the link of the heading in view, the last one
 * whose top has reached the line a contents link scrolls it to (its
 * scroll-margin-top, below the top bar), or the last heading once the page is
 * scrolled to its end. IntersectionObserver reports the crossings, so
 * scrolling itself reads no layout.
 */
const linkId = (link: HTMLAnchorElement) => decodeURIComponent(link.hash.slice(1));

export function mountTocSpy(root: Document = document): void {
  const view = root.defaultView;
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.cl-toc-link')];
  const headings = [...new Set(links.map(linkId))]
    .map((id) => root.getElementById(id))
    .filter((node): node is HTMLElement => node !== null);
  const first = headings[0];
  if (!view || !first) return;

  const reached = new Set<Element>();
  let atEnd = false;
  const mark = () => {
    const current = atEnd
      ? headings.at(-1)
      : (headings.filter((h) => reached.has(h)).at(-1) ?? first);
    for (const link of links) {
      if (linkId(link) === current?.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };

  // The observed band runs from far above the page down to the landing line,
  // so a heading is in it exactly when its top has reached that line.
  let headingObserver: IntersectionObserver | undefined;
  const observeHeadings = () => {
    headingObserver?.disconnect();
    const bar = root.querySelector<HTMLElement>('[data-docs-bar]');
    const line = Math.max(
      Number.parseFloat(view.getComputedStyle(first).scrollMarginTop) || 0,
      bar?.getBoundingClientRect().bottom ?? 0,
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
  };

  const end = root.createElement('div');
  end.setAttribute('aria-hidden', 'true');
  root.body.append(end);
  new IntersectionObserver((entries) => {
    atEnd = entries.some((entry) => entry.isIntersecting) && view.scrollY > 0;
    mark();
  }).observe(end);

  observeHeadings();
  view.addEventListener('resize', observeHeadings);
  mark();
}
