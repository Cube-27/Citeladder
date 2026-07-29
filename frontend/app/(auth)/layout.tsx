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
    <div className="mkt-root relative min-h-dvh w-full overflow-hidden bg-slate-50 text-slate-900 antialiased selection:bg-indigo-500 selection:text-white min-[900px]:grid min-[900px]:grid-cols-12">
      {/* Subtle light ambient background lighting */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 size-[500px] rounded-full bg-indigo-200/50 blur-[120px]" />
        <div className="absolute -right-40 -bottom-40 size-[500px] rounded-full bg-sky-200/50 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-100/30 blur-[100px]" />
      </div>

      <AuthBrandPanel />

      <main className="relative flex min-h-dvh flex-col justify-between px-6 py-8 min-[900px]:col-span-7 sm:px-10 lg:px-16">
        {/* Header band — mobile wordmark */}
        <header className="flex items-center justify-between gap-3">
          <div className="min-[900px]:invisible">
            <AuthWordmark compact />
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">
            {children}

            {/* Mobile reassurance pills - No separating border lines */}
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600 min-[900px]:hidden">
              <li className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1">
                <span aria-hidden className="size-1.5 rounded-full bg-indigo-500" />
                Deterministic scoring
              </li>
              <li className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1">
                <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
                Verified evidence
              </li>
              <li className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1">
                <span aria-hidden className="size-1.5 rounded-full bg-sky-500" />
                Encrypted keys
              </li>
            </ul>
          </div>
        </div>

        {/* Footer band */}
        <footer className="text-xs text-slate-500">
          <span className="min-[900px]:hidden">© {new Date().getFullYear()} CUBE27</span>
        </footer>
      </main>
    </div>
  );
}
