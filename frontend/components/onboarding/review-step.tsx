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
    <section className="grid gap-2">
      <div className="flex items-center gap-2">
        <p className={eyebrowClasses}>{label}</p>
        <span className="text-subtle text-2xs">{count}</span>
        {action ? <div className="ms-auto">{action}</div> : null}
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
        'focus-ring inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors',
        selected
          ? 'border-accent-border bg-accent-subtle text-accent-text'
          : 'border-border text-muted hover:text-foreground',
      )}
    >
      {label}
      <X className={cn('size-3 shrink-0', selected ? 'opacity-70' : 'opacity-40')} aria-hidden />
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
    <div className="grid gap-6">
      <Section
        label="Your domains"
        count={`${domains.filter((d) => d.selected).length} of ${domains.length}`}
      >
        {domains.length === 0 ? (
          <p className="text-muted text-sm">None found — you can add these later.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
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
          <Button variant="ghost" size="sm" onClick={onAddCompetitor}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        }
      >
        {competitors.length === 0 ? (
          <p className="text-muted text-sm">None found — add any you want to track.</p>
        ) : (
          <ul className="grid list-none gap-1.5 p-0">
            {competitors.map((competitor, index) => (
              <li key={`competitor-${index}`} className="flex items-center gap-2">
                <Input
                  value={competitor.name}
                  onChange={(event) => onRenameCompetitor(index, event.target.value)}
                  aria-label={`Competitor ${index + 1} name`}
                  className={cn(!competitor.selected && 'opacity-50')}
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
          <p className="text-muted text-sm">None found — you can write your own after setup.</p>
        ) : (
          <ul className="border-border-subtle divide-border-subtle grid list-none divide-y rounded-lg border p-0">
            {prompts.map((prompt, index) => (
              <li key={`prompt-${index}`} className="flex items-start gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={prompt.selected}
                  onChange={() => onTogglePrompt(index)}
                  aria-label={prompt.text}
                  className="focus-ring accent-accent mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'text-foreground block text-sm',
                      !prompt.selected && 'text-muted line-through',
                    )}
                  >
                    {prompt.text}
                  </span>
                  {prompt.theme ? (
                    <span className="text-subtle text-2xs">{prompt.theme}</span>
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
