import type { Metadata } from 'next';
import { Geist_Mono, Inter, Manrope } from 'next/font/google';

import { QueryProvider } from '@/lib/providers/query-provider';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';

import './globals.css';

// Figma type system: Inter is the one sans family everywhere — there is no
// separate display face (`--font-display-family` resolves to Inter), so
// headings differ from body by size/tracking, not by family. Geist Mono
// stays for numeric/data contexts.
const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

// Display face for the marketing/auth "Proof" system ONLY — consumed via
// --font-mkt-display in app/(marketing)/marketing-theme.css. The app's own
// --font-display-family still resolves to Inter; nothing inside (app)
// renders Manrope.
const display = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
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
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
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
