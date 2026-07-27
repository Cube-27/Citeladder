import type { ReactNode } from 'react';

import { AuthBrandPanel, AuthWordmark } from '@/components/auth/brand-panel';

/**
 * Auth route-group layout, on the Proof surface.
 *
 * Split screen at ≥900px, **asymmetric on purpose**: the brand panel takes
 * 5/12 and the form 7/12. A 50/50 split gives equal weight to marketing copy
 * and the thing the user came to do, which is what makes the screen read as
 * flat — a sign-in page should lean toward the form.
 *
 * Both columns share one three-band rhythm — header / centred body / footer —
 * so the wordmark, the form and the fine print line up across the divide
 * instead of each column floating its own way. Below 900px the brand panel
 * drops and the form keeps the same bands.
 *
 * `.mkt-root` scopes the Proof system (light-only canvas, focus ring). There
 * is no ThemeToggle here: Proof is a light-only identity, and a toggle that
 * changed nothing would be a broken control.
 *
 * The single-h1 rule: the pages own the only h1 — the wordmarks are spans,
 * and the brand headline is a `<p>`.
 */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mkt-root bg-mkt-paper text-mkt-ink min-h-dvh min-[900px]:grid min-[900px]:grid-cols-12">
      <AuthBrandPanel />

      <main className="relative flex min-h-dvh flex-col px-6 py-8 min-[900px]:col-span-7 sm:px-10">
        {/* Header band — mirrors the brand panel's wordmark row so the two
            columns start on the same line. */}
        <header className="flex items-center justify-between gap-3">
          <div className="min-[900px]:invisible">
            <AuthWordmark compact />
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </div>

        {/* Footer band — balances the brand panel's copyright row. */}
        <footer className="text-mkt-sm text-mkt-ink-muted">
          <span className="min-[900px]:hidden">Your own API keys, encrypted at rest</span>
        </footer>
      </main>
    </div>
  );
}
