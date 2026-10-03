'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { hasAnalyticsConsent, subscribeToConsent } from '@/lib/consent/cookie-consent';

/**
 * `gtag.js` installs this pair on `window` as it boots. Both are optional here
 * because revocation can arrive before the lazily loaded tag has run at all.
 */
type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

const SCRIPT_ID = 'citeladder-google-analytics';

function clearAnalyticsCookies() {
  const hostParts = window.location.hostname.split('.');
  const domains = ['', ...hostParts.map((_, index) => `.${hostParts.slice(index).join('.')}`)];
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.trim().split('=')[0];
    if (!/^(_ga(?:_|$)|_gid$|_gat(?:_|$))/.test(name)) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}

function denyPendingAnalyticsDefaults(dataLayer: unknown[] | undefined) {
  for (const entry of dataLayer ?? []) {
    if (!Array.isArray(entry) || entry[0] !== 'consent' || entry[1] !== 'default') continue;
    const fields = entry[2];
    if (
      !fields ||
      typeof fields !== 'object' ||
      Array.isArray(fields) ||
      !('analytics_storage' in fields)
    )
      continue;
    entry[2] = { ...fields, analytics_storage: 'denied' };
  }
}

function configureLoadedTag(script: HTMLScriptElement, measurementId: string) {
  if (script.dataset.loaded !== 'true' || script.dataset.configured || !hasAnalyticsConsent())
    return;
  const gtag = (window as GtagWindow).gtag;
  gtag?.('consent', 'update', { analytics_storage: 'granted' });
  gtag?.('config', measurementId);
  script.dataset.configured = 'true';
}

function ctaDestinationType(anchor: HTMLAnchorElement, demo: boolean) {
  if (demo) return 'demo';
  return new URL(anchor.href).origin === window.location.origin ? 'internal' : 'external';
}

function marketingCtaFields(anchor: HTMLAnchorElement, demo: boolean) {
  const placement = anchor.closest<HTMLElement>('[data-cta-placement]');
  const region = anchor.closest('header, footer, nav, section');
  return {
    page_path: window.location.pathname,
    placement:
      placement?.dataset.ctaPlacement ?? (region?.id || region?.tagName.toLowerCase()) ?? 'page',
    cta_label: (anchor.getAttribute('aria-label') ?? anchor.textContent ?? '')
      .trim()
      .replace(/\s+/g, ' '),
    destination_type: ctaDestinationType(anchor, demo),
  };
}

/** One delegated listener covers SSR links and hydrated islands without double-firing. */
function trackMarketingCta(event: MouseEvent) {
  if (!hasAnalyticsConsent() || !(event.target instanceof Element)) return;
  const anchor = event.target.closest('a');
  if (!(anchor instanceof HTMLAnchorElement)) return;
  const demo = anchor.dataset.demoCta !== undefined;
  if (!demo && anchor.dataset.marketingCta === undefined) return;
  const fields = marketingCtaFields(anchor, demo);
  const gtag = (window as GtagWindow).gtag;
  gtag?.('event', 'marketing_cta_click', fields);
  if (demo) gtag?.('event', 'demo_contact_click', fields);
}

/** Successful submissions carry no visitor-supplied analytics properties. */
export function trackContactSubmitted() {
  if (!hasAnalyticsConsent()) return;
  (window as GtagWindow).gtag?.('event', 'contact_form_submitted', { source_page: '/contact' });
}

/** Load the optional Google tag only after an explicit analytics opt-in. */
export function GoogleAnalytics({ measurementId }: Readonly<{ measurementId: string }>) {
  const allowed = useSyncExternalStore(subscribeToConsent, hasAnalyticsConsent, () => false);

  useEffect(() => {
    document.addEventListener('click', trackMarketingCta);
    return () => document.removeEventListener('click', trackMarketingCta);
  }, []);

  useEffect(() => {
    const withGtag = window as GtagWindow;
    // Google's hard opt-out also stops cookieless measurement after withdrawal.
    Reflect.set(window, `ga-disable-${measurementId}`, !allowed);
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!allowed) {
      clearAnalyticsCookies();
      if (!existing) return;
      // A pending tag must never replay an old granted default on load.
      if (existing.dataset.loaded !== 'true') {
        denyPendingAnalyticsDefaults(withGtag.dataLayer);
      }
      withGtag.gtag?.('consent', 'update', { analytics_storage: 'denied' });
      return;
    }
    if (existing) {
      withGtag.gtag?.('consent', 'update', { analytics_storage: 'granted' });
      configureLoadedTag(existing, measurementId);
      return;
    }
    withGtag.dataLayer = withGtag.dataLayer || [];
    withGtag.gtag = (...args: unknown[]) => withGtag.dataLayer?.push(args);
    withGtag.gtag('consent', 'default', {
      analytics_storage: hasAnalyticsConsent() ? 'granted' : 'denied',
    });
    withGtag.gtag('js', new Date());
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.dataset.testid = 'external-script';
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        configureLoadedTag(script, measurementId);
      },
      { once: true },
    );
    document.head.appendChild(script);
  }, [allowed, measurementId]);

  return null;
}
