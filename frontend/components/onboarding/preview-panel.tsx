'use client';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import type { ReviewCompetitor, ReviewDomain, ReviewPrompt } from '@/lib/onboarding/forms';

/**
 * The right-hand panel: what the workspace will contain, filling in live as
 * discovery lands and the user edits.
 *
 * Deliberately a summary, not a mock dashboard. Rendering a fake Visibility
 * screen with invented scores would be showing the user numbers that do not
 * exist yet — the same reason the auth brand panel has no sample data. This
 * counts what is actually selected and nothing more.
 *
 * Hidden below `lg`, where the stacked layout gives it nowhere useful to sit
 * and the review step already shows the same lists.
 */
function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border-border-subtle flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-secondary text-sm">{label}</span>
      <span className="mono text-foreground text-sm">{value}</span>
    </div>
  );
}

export function PreviewPanel({
  brandName,
  domain,
  domains,
  competitors,
  prompts,
  step,
}: Readonly<{
  brandName: string;
  domain: string;
  domains: ReviewDomain[];
  competitors: ReviewCompetitor[];
  prompts: ReviewPrompt[];
  step: number;
}>) {
  const selected = {
    domains: domains.filter((d) => d.selected).length,
    competitors: competitors.filter((c) => c.selected).length,
    prompts: prompts.filter((p) => p.selected).length,
  };

  return (
    <aside className="bg-sidebar border-border hidden flex-col border-l p-8 lg:flex">
      <p className={eyebrowClasses}>Your workspace</p>

      <div className="mt-4">
        <p className="text-foreground text-heading-sm">
          {brandName.trim() || 'Your brand'}
        </p>
        {domain ? <p className="text-muted mt-0.5 text-sm">{domain}</p> : null}
      </div>

      <div className="mt-6">
        <Row label="Domains" value={step === 0 ? '—' : String(selected.domains)} />
        <Row label="Competitors" value={step === 0 ? '—' : String(selected.competitors)} />
        <Row label="Prompts" value={step === 0 ? '—' : String(selected.prompts)} />
      </div>

      <p className="text-subtle mt-auto text-xs">Everything here can be changed after setup.</p>
    </aside>
  );
}
