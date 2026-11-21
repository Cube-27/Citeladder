import {
  readConsent,
  subscribeToConsent,
  writeConsent,
  type ConsentDecision,
} from '@/lib/consent/cookie-consent';

export const COOKIE_PREFERENCES_ATTRIBUTE = 'data-cookie-preferences';

export const CONSENT_CHOICE_ATTRIBUTE = 'data-consent-choice';

function isDecision(value: string | undefined): value is ConsentDecision {
  return value === 'accepted' || value === 'rejected';
}

export function mountCookieBanner(region: HTMLElement): () => void {
  let trigger: HTMLElement | null = null;

  const render = () => {
    region.hidden = readConsent() !== null && trigger === null;
  };
  const closeReopened = () => {
    const opener = trigger;
    if (!opener) return;
    trigger = null;
    render();
    opener.focus();
  };

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
