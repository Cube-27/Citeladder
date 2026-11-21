export function mountCardRail(rail: HTMLElement): void {
  const nav = rail.querySelector<HTMLElement>('[data-card-rail-nav]');
  const track = rail.querySelector<HTMLElement>('[data-card-rail-track]');
  const prev = rail.querySelector<HTMLButtonElement>('[data-card-rail-prev]');
  const next = rail.querySelector<HTMLButtonElement>('[data-card-rail-next]');
  const status = rail.querySelector<HTMLElement>('[data-card-rail-status]');
  if (!nav || !track || !prev || !next) return;

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cardStep = () => {
    const first = track.firstElementChild;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    return first instanceof HTMLElement ? first.offsetWidth + gap : track.clientWidth;
  };
  const announce = (direction: -1 | 1) => {
    const items = [...track.children];
    const step = cardStep();
    const from = step > 0 ? Math.round(track.scrollLeft / step) : 0;
    const index = Math.min(items.length - 1, Math.max(0, from + direction));
    const name = items[index]?.querySelector<HTMLElement>('[data-rail-toggle]')?.dataset.label;
    const position = `${index + 1} of ${items.length}`;
    if (status) status.textContent = name ? `${name}, ${position}` : position;
  };
  const move = (direction: -1 | 1) => {
    announce(direction);
    track.scrollBy({ left: direction * cardStep(), behavior: reduceMotion() ? 'auto' : 'smooth' });
  };
  const sync = () => {
    const end = track.scrollWidth - track.clientWidth;
    prev.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft >= end - 1;
  };

  const cards = [...track.querySelectorAll<HTMLElement>('[data-rail-card]')];
  const setOpen = (card: HTMLElement, open: boolean) => {
    const toggle = card.querySelector<HTMLButtonElement>('[data-rail-toggle]');
    const more = toggle
      ? document.getElementById(toggle.getAttribute('aria-controls') ?? '')
      : null;
    if (!toggle || !more) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', `${open ? 'Close' : 'More about'} ${toggle.dataset.label}`);
    const page = card.querySelector<HTMLElement>('.cl-railcard-page');
    for (const layer of [more, page]) {
      layer?.toggleAttribute('inert', !open);
      if (open) layer?.removeAttribute('aria-hidden');
      else layer?.setAttribute('aria-hidden', 'true');
    }
    card.toggleAttribute('data-expanded', open);
  };
  const toggleCard = (card: HTMLElement) => {
    const open = card.dataset.expanded === undefined;
    for (const other of cards) if (other !== card) setOpen(other, false);
    setOpen(card, open);
    sync();
  };
  for (const card of cards) {
    card.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('a')) return;
      toggleCard(card);
    });
  }

  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  track.addEventListener('scroll', sync, { passive: true });
  track.addEventListener('transitionend', sync);
  window.addEventListener('resize', sync);
  sync();
  nav.dataset.ready = '';
  rail.dataset.ready = '';
}
