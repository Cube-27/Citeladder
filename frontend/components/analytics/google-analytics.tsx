'use client';

import Script from 'next/script';
import { useSyncExternalStore } from 'react';

import { hasAnalyticsConsent, subscribeToConsent } from '@/lib/consent/cookie-consent';

/** Load the optional Google tag only after an explicit analytics opt-in. */
export function GoogleAnalytics({ measurementId }: Readonly<{ measurementId: string }>) {
  const allowed = useSyncExternalStore(subscribeToConsent, hasAnalyticsConsent, () => false);

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
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
