import { FileSearch, Lock, Target } from 'lucide-react';
import Link from 'next/link';

import { Meta } from '@/components/marketing/primitives/label';
import { Wordmark } from '@/components/marketing/primitives/wordmark';
import { cn } from '@/lib/utils';

/**
 * Auth brand panel — the left column of the split-screen auth shell, on the
 * Proof surface.
 *
 * Deliberately free of product screenshots and sample dashboards: an
 * unauthenticated visitor has no data, and inventing a fictional workspace to
 * decorate a sign-in page would misrepresent the product. The panel states
 * what Searchify does and how it treats your keys, and stops there.
 *
 * The proof points are labels, not paragraphs. Nobody reads a methodology
 * note while trying to log in, and the marketing site makes the argument at
 * length — three short lines carry the same reassurance and let the headline
 * breathe.
 *
 * Hidden below 900px, where the form column renders <AuthWordmark compact>
 * above the form instead.
 *
 * The single-h1 rule: the auth pages own the only h1 — the wordmarks here are
 * spans, and the brand headline is a `<p>`.
 */
const PROOF_POINTS = [
  {
    icon: Target,
    lead: 'Deterministic Scoring',
    description: 'Repeatable, objective AI search performance evaluation',
  },
  {
    icon: FileSearch,
    lead: 'Evidence For Every Metric',
    description: 'Trace ratings directly back to verified model outputs',
  },
  {
    icon: Lock,
    lead: 'Encrypted Key Vault',
    description: 'Your own API keys, fully encrypted with zero retention',
  },
] as const;

export function AuthWordmark({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <Link
      href="/"
      aria-label="Searchify home"
      className="group inline-flex items-center gap-2.5 no-underline"
    >
      <Wordmark className={cn(compact && 'text-mkt-body')} />
    </Link>
  );
}

export function AuthBrandPanel() {
  return (
    <div className="relative col-span-5 flex min-h-full flex-col justify-between px-10 py-10 max-[900px]:hidden xl:px-14">
      {/* Subtle light ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 size-96 rounded-full bg-indigo-200/40 blur-[100px]" />
        <div className="absolute top-1/2 -right-24 size-80 rounded-full bg-sky-200/40 blur-[90px]" />
      </div>

      <div className="flex flex-col gap-10">
        <div>
          <AuthWordmark />
        </div>

        {/* Feature showcase */}
        <div className="my-auto max-w-lg space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-indigo-600"></span>
            </span>
            Enterprise AI Search Intelligence
          </div>

          <div className="space-y-3">
            <h2 className="font-mkt-display text-3xl leading-tight font-bold text-slate-900 sm:text-4xl">
              See how AI models talk about your brand.
            </h2>
            <p className="text-base leading-relaxed text-slate-600">
              Continuous, automated audits across ChatGPT, Gemini, and Claude with the real prompts
              your buyers ask.
            </p>
          </div>

          {/* Feature Cards - No separating lines */}
          <div className="grid gap-3 pt-2">
            {PROOF_POINTS.map((proof) => (
              <div
                key={proof.lead}
                className="group shadow-card flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:border-indigo-300"
              >
                <div
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600 transition-transform duration-200 group-hover:scale-105"
                >
                  <proof.icon className="size-5" strokeWidth={1.75} />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900">{proof.lead}</p>
                  <p className="text-xs text-slate-500">{proof.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer info & active engine status */}
      <div className="flex items-center justify-between pt-6 text-xs text-slate-500">
        <Meta as="p" className="text-slate-500">
          © {new Date().getFullYear()} CUBE27
        </Meta>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span>ChatGPT • Gemini • Claude Active</span>
        </div>
      </div>
    </div>
  );
}
