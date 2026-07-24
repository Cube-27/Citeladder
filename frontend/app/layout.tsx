import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { QueryProvider } from '@/lib/providers/query-provider';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';

import './globals.css';

// Flat/hairline language: one sans family everywhere — there is no separate
// display face. Headings differ from body by size/tracking, not by family.
const sans = Geist({
  subsets: ['latin'],
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
  title: 'Searchify',
  description: 'AI visibility analytics — see how LLMs represent your brand.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}`}
    >
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
