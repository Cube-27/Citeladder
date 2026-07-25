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
 * Hidden below 900px, where the form panel renders <AuthWordmark compact>
 * above the auth card instead.
 *
 * The single-h1 rule: the auth pages own the only h1 — the wordmarks here are
 * spans, and the brand headline is a `<p>`.
 */

const PROOF_POINTS = [
  {
    icon: Target,
    lead: 'Deterministic scoring',
    rest: 'The same answers always produce the same score, so a change in the number means a change in the market — not in the method.',
  },
  {
    icon: FileSearch,
    lead: 'Evidence for every number',
    rest: 'Each metric links back to the raw model response it came from. Nothing is a black box.',
  },
  {
    icon: Lock,
    lead: 'Your own API keys',
    rest: 'Audits run on your provider keys, encrypted at rest and never shared between workspaces.',
  },
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
          Searchify audits ChatGPT, Gemini, and Claude with the prompts your buyers actually ask.
        </p>

        <ul className="mt-10 grid list-none gap-5 p-0">
          {PROOF_POINTS.map((proof) => (
            // Grid (not flex) so the icon column is a fixed track and the
            // title and body share one left edge instead of stepping in.
            <li key={proof.lead} className="grid grid-cols-[16px_1fr] items-start gap-x-3 gap-y-1">
              <proof.icon className="text-muted mt-0.5 size-4" strokeWidth={1.75} aria-hidden />
              <p className="text-foreground text-base font-medium">{proof.lead}</p>
              <p className="text-muted col-start-2 text-xs">{proof.rest}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-muted text-2xs">© {new Date().getFullYear()} CUBE27</p>
    </aside>
  );
}
