'use client';

import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';
import type { ReviewCompetitor, ReviewDomain, ReviewPrompt } from '@/lib/onboarding/forms';

/**
 * Review step — everything discovery produced, pre-selected and editable.
 *
 * Selection rather than deletion: a suggestion the user deselects stays in the
 * list greyed out, so changing their mind is one click and not a retype. Only
 * selected rows reach `POST /projects`.
 *
 * Kept intentionally plain. This screen already carries three lists; adding
 * per-row aliases, intent pickers and domain editors — all of which the old
 * five-step setup form had — would bury the one thing being asked here, which
 * is "does this look right?". Everything else is editable later.
 */
function Section({
  label,
  count,
  children,
  action,
}: Readonly<{
  label: string;
  count: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}>) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 transition-all">
      <div className="mb-3.5 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <p className="text-xs font-bold uppercase text-slate-700">{label}</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-3xs font-semibold text-slate-600">
            {count}
          </span>
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Chip({
  label,
  selected,
  onToggle,
}: Readonly<{ label: string; selected: boolean; onToggle: () => void }>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
        selected
          ? 'border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100/80'
          : 'border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100',
      )}
    >
      <span>{label}</span>
      <X
        className={cn('size-3.5 shrink-0 transition-opacity', selected ? 'opacity-70' : 'opacity-40')}
        aria-hidden
      />
    </button>
  );
}

export function ReviewStep({
  domains,
  competitors,
  prompts,
  onToggleDomain,
  onToggleCompetitor,
  onTogglePrompt,
  onRenameCompetitor,
  onAddCompetitor,
}: Readonly<{
  domains: ReviewDomain[];
  competitors: ReviewCompetitor[];
  prompts: ReviewPrompt[];
  onToggleDomain: (index: number) => void;
  onToggleCompetitor: (index: number) => void;
  onTogglePrompt: (index: number) => void;
  onRenameCompetitor: (index: number, name: string) => void;
  onAddCompetitor: () => void;
}>) {
  const selectedPrompts = prompts.filter((p) => p.selected).length;

  return (
    <div className="grid gap-5">
      <Section
        label="Your domains"
        count={`${domains.filter((d) => d.selected).length} of ${domains.length}`}
      >
        {domains.length === 0 ? (
          <p className="text-slate-500 text-sm italic">None found — you can add these later.</p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {domains.map((entry, index) => (
              <Chip
                key={entry.domain}
                label={entry.domain}
                selected={entry.selected}
                onToggle={() => onToggleDomain(index)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        label="Competitors"
        count={`${competitors.filter((c) => c.selected).length} of ${competitors.length}`}
        action={
          <Button variant="ghost" size="sm" onClick={onAddCompetitor} className="text-indigo-600 hover:bg-indigo-50">
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        }
      >
        {competitors.length === 0 ? (
          <p className="text-slate-500 text-sm italic">None found — add any you want to track.</p>
        ) : (
          <ul className="grid list-none gap-2 p-0">
            {competitors.map((competitor, index) => (
              <li key={`competitor-${index}`} className="flex items-center gap-2">
                <Input
                  value={competitor.name}
                  onChange={(event) => onRenameCompetitor(index, event.target.value)}
                  aria-label={`Competitor ${index + 1} name`}
                  className={cn(
                    'bg-slate-50/80 border-slate-200 text-slate-900 focus:bg-white',
                    !competitor.selected && 'opacity-50 line-through',
                  )}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    competitor.selected
                      ? `Exclude ${competitor.name || 'competitor'}`
                      : `Include ${competitor.name || 'competitor'}`
                  }
                  aria-pressed={competitor.selected}
                  onClick={() => onToggleCompetitor(index)}
                  className={cn(
                    competitor.selected
                      ? 'text-slate-400 hover:text-slate-700'
                      : 'text-indigo-600 hover:text-indigo-700 bg-indigo-50',
                  )}
                >
                  <X className={cn('size-4', !competitor.selected && 'opacity-40')} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Starting prompts" count={`${selectedPrompts} of ${prompts.length}`}>
        {prompts.length === 0 ? (
          <p className="text-slate-500 text-sm italic">None found — you can write your own after setup.</p>
        ) : (
          <ul className="divide-slate-100 grid list-none divide-y rounded-xl border border-slate-200/80 bg-slate-50/50 p-0 overflow-hidden">
            {prompts.map((prompt, index) => (
              <li
                key={`prompt-${index}`}
                className={cn(
                  'flex items-start gap-3.5 px-4 py-3 transition-colors hover:bg-white',
                  prompt.selected ? 'bg-white/80' : 'bg-slate-50/40',
                )}
              >
                <input
                  type="checkbox"
                  checked={prompt.selected}
                  onChange={() => onTogglePrompt(index)}
                  aria-label={prompt.text}
                  className="mt-0.5 size-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500/20 shrink-0 cursor-pointer"
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span
                    className={cn(
                      'block text-sm leading-relaxed transition-all',
                      prompt.selected ? 'text-slate-800 font-medium' : 'text-slate-400 line-through',
                    )}
                  >
                    {prompt.text}
                  </span>
                  {prompt.theme ? (
                    <span className="inline-block rounded-full bg-slate-200/60 px-2 py-0.5 text-3xs font-medium text-slate-600">
                      {prompt.theme}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
