/**
 * Mounts a CardRail's previous and next buttons: each moves the row one card,
 * and a button is disabled when the row cannot move that way (both, when
 * every card already fits). Shows the buttons once they work.
 */
export function mountCardRail(rail: HTMLElement): void {
  const nav = rail.querySelector<HTMLElement>('[data-card-rail-nav]');
  const track = rail.querySelector<HTMLElement>('[data-card-rail-track]');
  const prev = rail.querySelector<HTMLButtonElement>('[data-card-rail-prev]');
  const next = rail.querySelector<HTMLButtonElement>('[data-card-rail-next]');
  if (!nav || !track || !prev || !next) return;

  const cardStep = () => {
    const first = track.firstElementChild;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    return first instanceof HTMLElement ? first.offsetWidth + gap : track.clientWidth;
  };
  const move = (direction: -1 | 1) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: direction * cardStep(), behavior: reduce ? 'auto' : 'smooth' });
  };
  const sync = () => {
    const end = track.scrollWidth - track.clientWidth;
    prev.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft >= end - 1;
  };

  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  track.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
  nav.dataset.ready = '';
}
