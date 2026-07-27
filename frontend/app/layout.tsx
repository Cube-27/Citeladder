import type { Metadata } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';

import { QueryProvider } from '@/lib/providers/query-provider';
import { SITE_NAME, SITE_TAGLINE, siteOrigin } from '@/lib/seo/site';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';

import './globals.css';

// ADS type system: Inter is the one sans family everywhere — there is no
// separate display face (`--font-display-family` resolves to Inter, and the
// marketing `--font-mkt-display` aliases it too), so headings differ from
// body by size and weight, not by family. The 700 cut is loaded because
// `--weight-bold` is a true 700 on the ADS ladder. Geist Mono stays for
// numeric/data contexts.
const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

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
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* Pre-hydration theme bootstrap — sets data-theme before first paint
            to avoid a flash (see lib/theme.ts). Must run before hydration. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
