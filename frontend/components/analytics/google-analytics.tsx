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

/** Load the optional Google tag only after an explicit analytics opt-in. */
export function GoogleAnalytics({ measurementId }: Readonly<{ measurementId: string }>) {
  const allowed = useSyncExternalStore(subscribeToConsent, hasAnalyticsConsent, () => false);

  useEffect(() => {
    const withGtag = window as GtagWindow;
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!allowed) {
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
