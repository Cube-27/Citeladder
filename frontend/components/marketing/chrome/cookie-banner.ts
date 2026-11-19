import {
  readConsent,
  subscribeToConsent,
  writeConsent,
  type ConsentDecision,
} from '@/lib/consent/cookie-consent';

/**
 * The cookie consent banner's behaviour (`CookieBanner.astro` owns the markup).
 *
 * The Cookie Policy promises that "where a consent banner is available on the
 * site, you can update non-essential preferences there", and this is the gate
 * analytics must pass through before any tag ships.
 *
 * Accept or reject, both one click and equally prominent. The decision lives
 * in `localStorage`, which the server cannot read, so the region is rendered
 * hidden and revealed here only for an undecided visitor: a visitor who
 * already answered never sees it flash. Consent changes in another tab
 * propagate through the consent subscription.
 *
 * A visitor who already answered reopens the panel from the footer's
 * "Cookie preferences" control (`COOKIE_PREFERENCES_ATTRIBUTE`) rather than a
 * floating tab that would sit over every page.
 */

/** Marks any server-rendered control that reopens the consent panel. */
export const COOKIE_PREFERENCES_ATTRIBUTE = 'data-cookie-preferences';

/** Marks the banner's two answer buttons, valued with the decision they record. */
export const CONSENT_CHOICE_ATTRIBUTE = 'data-consent-choice';

function isDecision(value: string | undefined): value is ConsentDecision {
  return value === 'accepted' || value === 'rejected';
}

/** Attach the banner's behaviour to its region. Returns a stop function. */
export function mountCookieBanner(region: HTMLElement): () => void {
  // The control that reopened the panel; null while an undecided visitor is asked.
  let trigger: HTMLElement | null = null;

  const render = () => {
    region.hidden = readConsent() !== null && trigger === null;
  };
  // A reopened panel closes on an answer or Escape and hands focus back.
  const closeReopened = () => {
    const opener = trigger;
    if (!opener) return;
    trigger = null;
    render();
    opener.focus();
  };

  // The footer control is static markup, so the banner listens by delegation.
  const reopen = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>(`[${COOKIE_PREFERENCES_ATTRIBUTE}]`);
    if (!control) return;
    trigger = control;
    render();
    region.focus();
  };
  const decide = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const choice =
      event.target
        .closest(`[${CONSENT_CHOICE_ATTRIBUTE}]`)
        ?.getAttribute(CONSENT_CHOICE_ATTRIBUTE) ?? undefined;
    if (!isDecision(choice)) return;
    // Writing notifies the consent subscription below, which re-renders.
    writeConsent(choice);
    closeReopened();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeReopened();
  };

  document.addEventListener('click', reopen);
  document.addEventListener('keydown', onKeyDown);
  region.addEventListener('click', decide);
  const unsubscribe = subscribeToConsent(render);
  render();
  return () => {
    unsubscribe();
    document.removeEventListener('click', reopen);
    document.removeEventListener('keydown', onKeyDown);
    region.removeEventListener('click', decide);
  };
}
