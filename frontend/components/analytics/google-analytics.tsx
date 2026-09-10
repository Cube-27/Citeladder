'use client';

import Script from 'next/script';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { hasAnalyticsConsent, subscribeToConsent } from '@/lib/consent/cookie-consent';

/**
 * `gtag.js` installs this pair on `window` as it boots. Both are optional here
 * because revocation can arrive before the lazily loaded tag has run at all.
 */
type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

/** Load the optional Google tag only after an explicit analytics opt-in. */
export function GoogleAnalytics({ measurementId }: Readonly<{ measurementId: string }>) {
  const allowed = useSyncExternalStore(subscribeToConsent, hasAnalyticsConsent, () => false);
  const wasAllowed = useRef(false);

  /**
   * Unmounting the two `Script` tags is not a revocation. By the time consent
   * is withdrawn `gtag.js` has already executed, and it keeps its own timers
   * and `dataLayer` queue that no longer belong to React — removing the
   * elements leaves it collecting. Consent Mode is the only channel the tag
   * itself listens on, so tell it, then drop the elements.
   */
  useEffect(() => {
    if (allowed) {
      wasAllowed.current = true;
      return;
    }
    if (!wasAllowed.current) return;
    wasAllowed.current = false;
    const withGtag = window as GtagWindow;
    withGtag.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  }, [allowed]);

  if (!allowed) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="lazyOnload"
      />
      <Script id="google-analytics" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
