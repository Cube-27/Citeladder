import { FileSearch, Lock, Target } from 'lucide-react';
import Link from 'next/link';

import { LogoMark } from '@/components/ui/logo-mark';
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
      <LogoMark size={compact ? 24 : 28} />
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
    <aside className="auth-brand border-border bg-well relative isolate col-span-5 flex flex-col overflow-hidden border-r px-12 py-8 max-[900px]:hidden">
      <AuthWordmark />

      {/* Centred body — same band rhythm as the form column, so the headline
          sits on the form's optical centre line rather than drifting. */}
      <div className="flex flex-1 items-center py-12">
        <div className="max-w-[420px]">
          <p className="text-foreground text-2xl leading-[1.15] font-semibold tracking-[-0.02em]">
            See how AI answers talk about your brand.
          </p>
          <p className="text-secondary mt-3 text-base">
            Audits ChatGPT, Gemini, and Claude with the prompts your buyers ask.
          </p>

          {/* Rule + list rather than free-floating rows: the panel had three
              icon rows with nothing anchoring them, which is most of why it
              read as unstructured. */}
          <ul className="border-border-subtle mt-10 grid list-none gap-3 border-t p-0 pt-6">
            {PROOF_POINTS.map((proof) => (
              <li key={proof.lead} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="border-border-subtle bg-panel text-accent-text flex size-7 shrink-0 items-center justify-center rounded-md border"
                >
                  <proof.icon className="size-3.5" strokeWidth={1.75} />
                </span>
                <span className="text-secondary text-sm">{proof.lead}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-subtle text-xs">© {new Date().getFullYear()} CUBE27</p>
    </aside>
  );
}
