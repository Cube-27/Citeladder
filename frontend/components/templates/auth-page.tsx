import type { ReactNode } from 'react';

import { AuthShowcase } from '@/components/ui/auth-showcase';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { textRole } from '@/components/ui/typography';

/**
 * Auth: account access (sign-in, sign-up and the mailbox screens) across the
 * whole window. The form is centred in the left half, a 480px column on the
 * card's fill with the theme switch above it and `footer` (one caption line)
 * under it; its controls are 48 tall. From `desktop:` the flat product
 * showcase fills the right half, pinned while the document scrolls, so a tall
 * form never squeezes. Below `desktop:` the showcase drops away.
 */
export function AuthPage({
  footer,
  children,
}: Readonly<{ footer: ReactNode; children: ReactNode }>) {
  return (
    <div className="bg-surface text-ink desktop:grid-cols-2 grid min-h-dvh antialiased">
      <div className="flex min-h-dvh min-w-0 flex-col px-[var(--content-gutter)]">
        <div className="flex h-12 items-center justify-end">
          <ThemeSwitch />
        </div>
        <main
          id="main"
          aria-label="Account access"
          className="grid flex-1 content-center justify-items-center py-2 [--control-md:var(--control-lg)]"
        >
          <div className="max-w-flow w-full">{children}</div>
        </main>
        <footer className={textRole('caption', 'py-3 text-center')}>{footer}</footer>
      </div>
      <AuthShowcase />
    </div>
  );
}
