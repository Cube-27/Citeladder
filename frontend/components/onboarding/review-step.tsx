'use client';

import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ReviewCompetitor, ReviewDomain, ReviewPrompt } from '@/lib/onboarding/forms';

/**
 * Review step — everything discovery produced, pre-selected and editable.
 *
 * Selection rather than deletion: a suggestion the user deselects stays in the
 * list greyed out, so changing their mind is one click and not a retype. Only
 * selected rows reach `POST /projects`.
 *
 * Laid out dense and planar rather than as three stacked cards: the short
 * identity lists (domains, competitors) share one row, and prompts fill the
 * width beneath in a 2-column grid — so the whole review fits without nested
 * card padding or a long scroll. Kept intentionally devoid of per-row aliases,
 * intent pickers and domain editors; everything is editable after setup.
 */

/**
 * Section label + "N selected" count badge.
 *
 * Baseline-aligned, not center-aligned: centering mixes each element's font
 * metrics (`items-center` centers each font's own box, and tracking on the
 * uppercase label shifts its baseline), which visually drops the pill ~1–2px
 * below the label. Matching text-* tokens share `docs/design.md`'s known
 * line-heights so their baselines align directly.
 */
function SectionHead({
  label,
  count,
  muted = false,
}: Readonly<{ label: string; count: string; muted?: boolean }>) {
  return (
    <div className="flex items-baseline gap-2">
      <p
        className={cn(
          'text-2xs font-bold uppercase',
          muted ? 'text-slate-500' : 'text-slate-700',
        )}
      >
        {label}
      </p>
      <span className="text-3xs inline-flex translate-y-[-0.5px] items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-500">
        {count}
      </span>
    </div>
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
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200',
        selected
          ? 'border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100/80'
          : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700',
      )}
    >
      <span className="truncate">{label}</span>
      <X
        className={cn(
          'size-4 shrink-0 transition-opacity',
          selected ? 'opacity-70' : 'opacity-40',
        )}
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
    <div className="flex flex-col gap-5">
      {/* Domains + competitors share one separated panel — both are short
          identity lists, so splitting them into their own cards was pure air.
          Each column carries its own header so the badge never orphans from its
          list when the columns stack on narrow screens. */}
      <section className="overflow-hidden rounded-xl border border-slate-200">
        <div className="grid bg-white md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-w-0 px-4 pt-3 pb-4">
            <div className="-mx-2 w-fit rounded-md bg-slate-50 px-2 py-1.5">
              <SectionHead
                label="Your domains"
                count={`${domains.filter((d) => d.selected).length} selected`}
              />
            </div>
            {domains.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500 italic">
                None found — you can add these later.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap content-start gap-2">
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
          </div>

          <div className="min-w-0 border-t border-slate-200 px-4 pt-3 pb-4 md:border-t-0 md:border-l">
            <div className="-mx-2 w-fit rounded-md bg-slate-50 px-2 py-1.5">
              <SectionHead
                label="Competitors"
                count={`${competitors.filter((c) => c.selected).length} selected`}
              />
            </div>
            {competitors.length === 0 && (
              <p className="mt-3 text-sm text-slate-500 italic">
                None found — add any you want to track.
              </p>
            )}
            <ul className="mt-3 grid list-none content-start gap-1.5 sm:grid-cols-2">
              {competitors.map((competitor, index) => (
                <li key={competitor.id} className="flex items-center gap-1.5">
                  <Input
                    value={competitor.name}
                    onChange={(event) => onRenameCompetitor(index, event.target.value)}
                    aria-label={`Competitor ${index + 1} name`}
                    className={cn(
                      'h-8 border-slate-200 bg-slate-50/80 text-sm text-slate-900 focus:bg-white',
                      !competitor.selected && 'line-through opacity-50',
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
                      'size-8 shrink-0',
                      competitor.selected
                        ? 'text-slate-400 hover:text-slate-700'
                        : 'bg-indigo-50 text-indigo-600 hover:text-indigo-700',
                    )}
                  >
                    <X className={cn('size-4', !competitor.selected && 'opacity-40')} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddCompetitor}
              className="mt-2 px-2 text-indigo-600 hover:bg-indigo-50"
            >
              <Plus className="size-4" aria-hidden />
              Add competitor
            </Button>
          </div>
        </div>
      </section>

      {/* Prompts fill the width in a 2-column grid instead of one long list. */}
      <section>
        <div className="mb-2 px-1">
          <SectionHead label="Starting prompts" count={`${selectedPrompts} selected`} />
        </div>
        {prompts.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500 italic">
            None found — you can write your own after setup.
          </p>
        ) : (
          <ul className="grid list-none grid-cols-1 gap-2 md:grid-cols-2">
            {prompts.map((prompt, index) => (
              <li key={prompt.id}>
                <label
                  className={cn(
                    'flex h-full cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors duration-200',
                    prompt.selected
                      ? 'border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/70'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={prompt.selected}
                    onChange={() => onTogglePrompt(index)}
                    aria-label={prompt.text}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span
                      className={cn(
                        'block text-sm leading-snug transition-colors',
                        prompt.selected
                          ? 'font-medium text-slate-800'
                          : 'text-slate-400 line-through',
                      )}
                    >
                      {prompt.text}
                    </span>
                    {prompt.theme ? (
                      <span className="text-3xs inline-block rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                        {prompt.theme}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
