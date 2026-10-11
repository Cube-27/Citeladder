import { mountCookieBanner } from '@/components/marketing/chrome/cookie-banner';

/**
 * The consent region as `CookieBanner.astro` serves it: hidden, with the two
 * answer buttons. Mounted with its real behaviour; returns a cleanup.
 */
export function mountCookieBannerFixture(): () => void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<section hidden aria-label="Cookie consent" tabindex="-1" data-cookie-banner>
      <h2>Cookie settings</h2>
      <button type="button" data-consent-choice="rejected"><span>Reject</span></button>
      <button type="button" data-consent-choice="accepted"><span>Accept</span></button>
    </section>`,
  );
  const region = document.querySelector<HTMLElement>('[data-cookie-banner]')!;
  const stop = mountCookieBanner(region);
  return () => {
    stop();
    region.remove();
  };
}
