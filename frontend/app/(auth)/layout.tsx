import type { ReactNode } from 'react';

import { AuthBrandPanel, AuthWordmark } from '@/components/auth/brand-panel';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * Auth route-group layout.
 *
 * Split screen at ≥900px, **asymmetric on purpose**: the brand panel takes
 * 5/12 and the form 7/12. The old 50/50 gave equal weight to marketing copy and
 * the thing the user came to do, which is what made the screen read as flat —
 * a sign-in page should lean toward the form.
 *
 * Both columns share one three-band rhythm — header / centred body / footer —
 * so the wordmark, the form and the fine print line up across the divide
 * instead of each column floating its own way. Below 900px the brand panel
 * drops and the form keeps the same bands.
 *
 * The single-h1 rule: the pages own the only h1 — the wordmarks are spans, and
 * the brand headline is a `<p>`.
 */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bg-background min-h-dvh min-[900px]:grid min-[900px]:grid-cols-12">
      <AuthBrandPanel />

      <main className="relative flex min-h-dvh flex-col px-6 py-8 min-[900px]:col-span-7 sm:px-10">
        {/* Header band — mirrors the brand panel's wordmark row so the two
            columns start on the same line. */}
        <header className="flex items-center justify-between gap-3">
          <div className="min-[900px]:invisible">
            <AuthWordmark compact />
          </div>
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>

        {/* Footer band — balances the brand panel's copyright row. */}
        <footer className="text-subtle text-xs">
          <span className="min-[900px]:hidden">Your own API keys, encrypted at rest</span>
        </footer>
      </main>
    </div>
  );
}
