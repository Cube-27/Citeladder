// The website's entrances (docs/design.md D35), loaded blocking in <head> so
// the hero's load-in starts with the first paint. Readers who ask for reduced
// motion, and browsers without IntersectionObserver, get the page as it is:
// nothing is ever hidden unless this script runs to the end.
//
// - `data-reveal` on <html> turns the motion styles on (layers.css).
// - Each section part below the first screen gets `data-rise` and its index
//   among its rising siblings (`--reveal-index`), and `data-revealed` once it
//   scrolls into view, so it rises in once.
// - Each product image below the first screen gets `data-play`, then
//   `data-played` when most of it is in view, so its rows, bars and chart
//   play out in front of the reader. The hero's own parts and image animate
//   on load from CSS alone.
(() => {
  const root = document.documentElement;
  try {
    if (
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
  } catch {
    return;
  }
  root.dataset.reveal = '';

  const RISE = [
    '.cl-shead-main > *',
    '.cl-shead-side',
    '.cl-engines',
    '.cl-bento-cell',
    '.cl-split-copy',
    '.cl-split-media',
    '.cl-related > li',
    '.cl-qcards > li',
    '.cl-steps > li',
    '.cl-faq',
    '.cl-page-section-aside',
    '.cl-page-hl',
    '.cl-cta',
    '.cl-tiles > *',
    '.cl-logo-group',
  ].join(',');
  const PLAY = '.cl-vig, .cl-screen';

  const watch = (selector, attribute, threshold, onEach) => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute(attribute, '');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold },
    );
    for (const element of document.querySelectorAll(selector)) {
      if (onEach(element) !== false) observer.observe(element);
    }
  };

  const start = () => {
    try {
      const fold = window.innerHeight;
      watch(RISE, 'data-revealed', 0.12, (element) => {
        // Already on the first screen: it was painted, so it stays put.
        if (element.getBoundingClientRect().top < fold) return false;
        const siblings = [...element.parentElement.children].filter((child) => child.matches(RISE));
        element.style.setProperty('--reveal-index', String(Math.min(siblings.indexOf(element), 5)));
        element.setAttribute('data-rise', '');
        return true;
      });
      watch(PLAY, 'data-played', 0.4, (element) => {
        // The hero's image plays on load in CSS; one already on screen stays put.
        if (element.getBoundingClientRect().top < fold) return false;
        element.setAttribute('data-play', '');
        return true;
      });
    } catch {
      // A failure leaves the page static rather than half hidden.
      delete root.dataset.reveal;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
