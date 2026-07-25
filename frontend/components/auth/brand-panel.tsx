import { FileSearch, Lock, Target } from 'lucide-react';
import Link from 'next/link';

import { LogoCube } from '@/components/ui/logo-cube';
import { cn } from '@/lib/utils';

/**
 * Auth brand panel — the left column of the split-screen auth shell.
 *
 * Deliberately free of product screenshots and sample dashboards: an
 * unauthenticated visitor has no data, and inventing a fictional workspace to
 * decorate a sign-in page would misrepresent the product. The panel states
 * what Searchify does and how it treats your keys, and stops there.
 *
 * Density (v2): the proof points are labels, not paragraphs. Each used to
 * carry a two-clause explanation beneath it, which turned a sign-in screen
 * into a landing page — nobody reads a methodology note while trying to log
 * in, and the marketing site already makes the argument at length. Three short
 * lines carry the same reassurance and let the headline breathe.
 *
 * Hidden below 900px, where the form panel renders <AuthWordmark compact>
 * above the auth card instead.
 *
 * The single-h1 rule: the auth pages own the only h1 — the wordmarks here are
 * spans, and the brand headline is a `<p>`.
 */

const PROOF_POINTS = [
  { icon: Target, lead: 'Deterministic scoring' },
  { icon: FileSearch, lead: 'Evidence for every number' },
  { icon: Lock, lead: 'Your own API keys, encrypted' },
] as const;

export function AuthWordmark({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <Link
      href="/"
      aria-label="Searchify home"
      className="focus-ring inline-flex items-center gap-2.5 rounded-md no-underline"
    >
      <LogoCube size={compact ? 24 : 26} />
      <span
        className={cn(
          'text-foreground font-semibold tracking-[-0.02em]',
          compact ? 'text-base' : 'text-lg',
        )}
      >
        Searchify
      </span>
      <span className="text-muted text-2xs font-medium">by CUBE27</span>
    </Link>
  );
}

export function AuthBrandPanel() {
  return (
    <aside className="bg-sidebar border-border flex flex-col justify-between border-r p-12 max-[900px]:hidden">
      <AuthWordmark />

      {/* Centred block — the panel's optical weight sits with the form card
          across the fold rather than pinned to the top. */}
      <div className="max-w-[420px] py-12">
        <p className="text-foreground text-2xl font-semibold tracking-[-0.02em]">
          See how AI answers talk about your brand.
        </p>
        <p className="text-secondary mt-3 text-base">
          Audits ChatGPT, Gemini, and Claude with the prompts your buyers ask.
        </p>

        <ul className="mt-10 grid list-none gap-3 p-0">
          {PROOF_POINTS.map((proof) => (
            <li key={proof.lead} className="flex items-center gap-3">
              <proof.icon className="text-muted size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="text-secondary text-sm">{proof.lead}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-muted text-2xs">© {new Date().getFullYear()} CUBE27</p>
    </aside>
  );
}
