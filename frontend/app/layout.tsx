import type { Metadata } from 'next';
import { Manrope, Public_Sans } from 'next/font/google';

import { QueryProvider } from '@/lib/providers/query-provider';
import { SITE_NAME, SITE_TAGLINE, siteOrigin } from '@/lib/seo/site';
import './globals.css';

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

const DIRECTION_CONTRACT = `<!--
THESIS: CiteLadder turns persisted AI evidence into the next measurable action; it refuses the metric-card gallery.
OWN-WORLD: refined light system — white/Gray-50 surfaces, one electric-blue accent, crisp micro-shadows over hairlines, Manrope display + Public Sans UI at weights 400–600, hero capped at 48px.
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
    <html lang="en" className={`${publicSans.variable} ${manrope.variable}`}>
      <body>
        <span hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
