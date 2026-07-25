import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';

import { AuthBrandPanel, AuthWordmark } from '@/components/auth/brand-panel';
import { Card } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * Auth route-group layout.
 *
 * Split-screen shell: at ≥900px a two-column grid pairs the brand panel
 * (components/auth/brand-panel) with the centred auth card; below 900px only
 * the form panel renders, with a compact wordmark above the card. Shared by
 * `/login` and `/register`.
 *
 * The single-h1 rule: the pages own the only h1 — the wordmarks are spans,
 * and the brand headline is a `<p>`.
 */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bg-background min-h-dvh min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AuthBrandPanel />

      {/* ── Form panel ───────────────────────────────────────────────── */}
      <main className="bg-background relative flex min-h-dvh flex-col items-center justify-center px-6 py-12">
        <div className="absolute top-5 right-5">
          <ThemeToggle />
        </div>
        <div className="flex w-full max-w-[380px] flex-col gap-5">
          <div className="flex flex-col items-center gap-3 min-[900px]:hidden">
            <AuthWordmark compact />
            {/* The single-h1 rule keeps this a <p> — the page owns the h1. */}
            <p className="text-secondary text-center text-base">
              See how AI answers talk about your brand.
            </p>
          </div>

          <Card className="w-full p-6" elevation="raised">
            {children}
          </Card>

          {/* Mobile only: on desktop the brand panel already carries this as a
              proof point, and repeating it either side of the fold is exactly
              the kind of duplication that made the screen feel busy. */}
          <p className="text-muted flex items-center justify-center gap-1.5 text-xs min-[900px]:hidden">
            <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Your own API keys, encrypted at rest
          </p>
        </div>
      </main>
    </div>
  );
}
