import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';

import { QueryProvider } from '@/lib/providers/query-provider';
import { SITE_NAME, SITE_TAGLINE, siteOrigin } from '@/lib/seo/site';
import './globals.css';

/**
 * Public Sans is the site's single typeface — the practical substitute for
 * Tesla's Universal Sans (see docs/design.md). One variable file carries the
 * only two weights the system uses (400 body / 500 display + UI), so `--font-sans`
 * and `--font-display` both resolve here. next/font self-hosts it at build
 * time, which keeps the app offline- and CSP-safe.
 */
const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
});

const DIRECTION_CONTRACT = `<!--
THESIS: CiteLadder turns persisted AI evidence into the next measurable action; it refuses the metric-card gallery.
OWN-WORLD: Tesla-derived restraint — white and Light Ash surfaces, one electric-blue accent, near-zero elevation, Public Sans at weights 400/500 with normal tracking and a 40px ceiling.
STORY: See project state, understand comparable movement, act on a ranked evidence-backed queue, then remeasure without causal overclaiming.
FIRST VIEWPORT: A sentence-led state header above a dominant movement chart and right-hand action queue; report and measurement actions sit with state.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and docs/design.md
-->`;

export const metadata: Metadata = {
  // metadataBase is omitted until a canonical origin is configured (B3);
  // relative OG/canonical URLs are tolerated by Next in that state.
  metadataBase: siteOrigin() ?? undefined,
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: 'AI visibility analytics — see how LLMs represent your brand.',
  applicationName: SITE_NAME,
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={publicSans.variable}>
      <body>
        <span hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
