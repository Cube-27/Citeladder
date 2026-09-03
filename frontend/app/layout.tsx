import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';

import { QueryProvider } from '@/lib/providers/query-provider';
import { SITE_NAME, SITE_TAGLINE, siteOrigin } from '@/lib/seo/site';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const uncutSans = localFont({
  src: '../public/fonts/UncutSans-Variable.woff2',
  variable: '--font-uncut-sans',
  display: 'swap',
});

const DIRECTION_CONTRACT = `<!--
THESIS: Prism Evidence is one calm editorial system from first visit through the operating workspace.
OWN-WORLD: paper ground and near-black ink, terracotta primary actions, terracotta for selection, focus and links, hairline rules and negative space carrying hierarchy, Uncut Sans editorial display with Inter body, and shadows reserved for floating UI.
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
  description:
    'Connect site and demand evidence, act on grounded opportunities, and track observed answer-engine citation share.',
  applicationName: SITE_NAME,
  icons: { icon: '/citeladder-favicon.ico' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${uncutSans.variable}`}>
      <body>
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
