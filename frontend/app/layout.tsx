import type { Metadata } from 'next';
import localFont from 'next/font/local';

import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { QueryProvider } from '@/lib/providers/query-provider';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteOrigin } from '@/lib/seo/site';
import './globals.css';

// Geist is the sole product face across product, public, and focused flows.
const geist = localFont({
  src: '../public/fonts/Geist-Variable.woff2',
  variable: '--font-geist',
  weight: '100 900',
  display: 'swap',
});

const DIRECTION_CONTRACT = `<!--
THESIS: Prism Evidence is one calm editorial system from first visit through the operating workspace.
OWN-WORLD: paper ground and dark navy ink, brand-blue primary actions, blue for selection, focus and links, hairline rules and negative space carrying hierarchy, Geist throughout, and shadows reserved for floating UI.
STORY: Understand the evidence loop, evaluate the product, enter the essential site facts, confirm exactly what will be tracked, then operate from persisted evidence.
FIRST VIEWPORT: Public pages use generous editorial rhythm and faithful product scenes; focused flows use a compact wordmark bar, centred task column, and persistent action bar.
FORM: shared semantic tokens, flat ruled ledgers rather than nested boxes, with a roomier public/focused-flow type ladder over the same visual world.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and docs/design.md
-->`;

export const metadata: Metadata = {
  // metadataBase is omitted until a canonical origin is configured (B3);
  // relative OG/canonical URLs are tolerated by Next in that state.
  metadataBase: siteOrigin() ?? undefined,
  title: {
    default: `${SITE_NAME} · ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: { icon: '/citeladder-favicon.ico' },
};

// Environment-only, with NO fallback: a hard-coded id would make every
// local and preview deployment report into the production property. Unset
// means the tag does not render at all.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        {GA_MEASUREMENT_ID ? <GoogleAnalytics measurementId={GA_MEASUREMENT_ID} /> : null}
        <span hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {/* First tab stop on every route. Visually hidden until focused, so
            keyboard and screen-reader users can skip repeated chrome. Each
            layout marks its own landmark with `id="main"`. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
