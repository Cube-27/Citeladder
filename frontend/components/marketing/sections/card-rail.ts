/**
 * Mounts a CardRail: its previous and next buttons move the row one card,
 * and a button is disabled when the row cannot move that way (both, when
 * every card already fits). Each RailCard's plus, or a press on the card
 * outside its links, opens the card in place and closes any other; the open
 * card's close (the same button) or a second press closes it. Shows the
 * controls once they work.
 */
export function mountCardRail(rail: HTMLElement): void {
  const nav = rail.querySelector<HTMLElement>('[data-card-rail-nav]');
  const track = rail.querySelector<HTMLElement>('[data-card-rail-track]');
  const prev = rail.querySelector<HTMLButtonElement>('[data-card-rail-prev]');
  const next = rail.querySelector<HTMLButtonElement>('[data-card-rail-next]');
  if (!nav || !track || !prev || !next) return;

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cardStep = () => {
    const first = track.firstElementChild;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    return first instanceof HTMLElement ? first.offsetWidth + gap : track.clientWidth;
  };
  const move = (direction: -1 | 1) => {
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
    // A closed card's open layers stay out of reach; the stylesheet fades
    // them (and the miniature, which a phone's open row keeps).
    const page = card.querySelector<HTMLElement>('.cl-railcard-page');
    for (const layer of [more, page]) {
      layer?.toggleAttribute('inert', !open);
      if (open) layer?.removeAttribute('aria-hidden');
      else layer?.setAttribute('aria-hidden', 'true');
    }
    card.toggleAttribute('data-expanded', open);
  };
  // An open card grows to the right only, so the steps run one after
  // another, never together: an open card closes, the row scrolls the
  // chosen card to its start, and only then does the card open. A newer
  // press cancels the steps an older one left waiting.
  let press = 0;
  let timer = 0;
  const later = (ms: number, then: () => void) => {
    window.clearTimeout(timer);
    if (ms <= 0) then();
    else timer = window.setTimeout(then, ms);
  };
  /** The rail's widening time in ms (`--motion-card`), 0 under reduced motion. */
  const widening = () => {
    if (reduceMotion()) return 0;
    const value = getComputedStyle(rail).getPropertyValue('--motion-card').trim();
    const ms = Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
    return Number.isFinite(ms) ? ms : 0;
  };
  /** Scrolls the row to `left` (clamped), then calls `then` once it rests. */
  const scrollThen = (left: number, then: () => void) => {
    const end = Math.max(0, Math.min(left, track.scrollWidth - track.clientWidth));
    if (Math.abs(track.scrollLeft - end) <= 1) {
      then();
      return;
    }
    const smooth = !reduceMotion();
    track.scrollTo({ left: end, behavior: smooth ? 'smooth' : 'auto' });
    if (!smooth) {
      then();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      track.removeEventListener('scrollend', finish);
      then();
    };
    track.addEventListener('scrollend', finish);
    // Browsers without `scrollend` (or a scroll that never starts) go on anyway.
    later(800, finish);
  };
  const startOf = (card: HTMLElement) => {
    const item = card.parentElement;
    const first = track.firstElementChild;
    return item instanceof HTMLElement && first instanceof HTMLElement
      ? item.offsetLeft - first.offsetLeft
      : track.scrollLeft;
  };
  const toggleCard = (card: HTMLElement) => {
    press += 1;
    const current = press;
    window.clearTimeout(timer);
    if (card.hasAttribute('data-expanded')) {
      setOpen(card, false);
      sync();
      return;
    }
    const closing = cards.filter((other) => other !== card && other.hasAttribute('data-expanded'));
    for (const other of closing) setOpen(other, false);
    later(closing.length > 0 ? widening() : 0, () => {
      if (current !== press) return;
      scrollThen(startOf(card), () => {
        if (current !== press) return;
        setOpen(card, true);
        sync();
        // A card near the row's end cannot reach its start before it widens;
        // once it has, bring it into view.
        later(widening(), () => {
          if (current === press && card.hasAttribute('data-expanded')) {
            scrollThen(startOf(card), sync);
          }
        });
      });
    });
    sync();
  };
  for (const card of cards) {
    card.addEventListener('click', (event) => {
      // A link inside the card still navigates; the toggle and the card's
      // own surface open or close it.
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
