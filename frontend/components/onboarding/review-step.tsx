'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ReviewCompetitor, ReviewDomain } from '@/lib/onboarding/forms';

function competitorUrl(competitor: ReviewCompetitor): string {
  const domain = competitor.domains.find(Boolean);
  if (!domain) return '';
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

/**
 * A reviewable suggestion, in both states.
 *
 * An unselected chip is rendered MUTED rather than dropped. Hiding it made
 * every exclusion permanent — and discovery legitimately returns more
 * suggestions than the cap pre-selects, so the extras were unreachable before
 * the user ever touched anything. A review step whose choices cannot be undone
 * is not a review step.
 */
function DomainChip({
  label,
  selected,
  onToggle,
}: Readonly<{ label: string; selected: boolean; onToggle: () => void }>) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
        selected
          ? 'border-accent-border/60 bg-accent-soft/80 text-accent-hover'
          : 'border-border-subtle text-muted border-dashed',
      )}
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${selected ? 'Exclude' : 'Include'} ${label}`}
        aria-pressed={selected}
        className="text-muted hover:text-foreground shrink-0 cursor-pointer p-0.5 transition-colors"
      >
        {selected ? (
          <X className="size-3.5" aria-hidden />
        ) : (
          <Plus className="size-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

function CompetitorChip({
  competitor,
  onToggle,
  onEditDomain,
}: Readonly<{
  competitor: ReviewCompetitor;
  onToggle: () => void;
  onEditDomain: (domain: string) => void;
}>) {
  const primaryDomain = competitor.domains.find(Boolean) || competitor.name;
  const displayName = competitor.name || primaryDomain || 'Competitor';

  const [isEditing, setIsEditing] = useState(
    competitor.name === '' && competitor.domains.length === 0,
  );
  const [editDomain, setEditDomain] = useState(primaryDomain);

  // The field is labelled, seeded, and placeheld as a DOMAIN, so it writes the
  // domain. It used to write `name` instead, which left `domains` holding the
  // value the user had just replaced — the submitted payload carried both, and
  // the chip's link still pointed at the old host.
  const handleSave = () => {
    setIsEditing(false);
    const trimmed = editDomain.trim();
    if (trimmed) {
      onEditDomain(trimmed);
    }
  };

  const url = competitorUrl(competitor);
  const selected = competitor.selected;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
        selected
          ? 'border-accent-border/60 bg-accent-soft/80 text-accent-hover'
          : 'border-border-subtle text-muted border-dashed',
      )}
    >
      {isEditing ? (
        <input
          autoFocus
          type="text"
          value={editDomain}
          onChange={(e) => setEditDomain(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') {
              setEditDomain(primaryDomain);
              setIsEditing(false);
            }
          }}
          placeholder="e.g. acme.com"
          aria-label={`Edit domain for ${displayName}`}
          className="text-accent-hover placeholder:text-accent-hover/50 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium focus:ring-0 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditDomain(primaryDomain);
            setIsEditing(true);
          }}
          title="Click chip to edit domain"
          className="text-accent-hover min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-medium"
        >
          {displayName}
        </button>
      )}

      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="sr-only">
          {url}
        </a>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        aria-label={`${selected ? 'Exclude' : 'Include'} ${displayName}`}
        aria-pressed={selected}
        className="text-muted hover:text-foreground shrink-0 cursor-pointer p-0.5 transition-colors"
      >
        {selected ? (
          <X className="size-3.5" aria-hidden />
        ) : (
          <Plus className="size-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

export function ReviewStep({
  domains,
  competitors,
  onToggleDomain,
  onToggleCompetitor,
  onEditCompetitorDomain,
  onAddCompetitor,
  maximumCompetitors,
}: Readonly<{
  domains: ReviewDomain[];
  competitors: ReviewCompetitor[];
  onToggleDomain: (index: number) => void;
  onToggleCompetitor: (index: number) => void;
  onEditCompetitorDomain: (index: number, domain: string) => void;
  onAddCompetitor: () => void;
  maximumCompetitors: number | undefined;
}>) {
  const selectedDomains = domains.filter((d) => d.selected);
  const selectedCompetitors = competitors.filter((c) => c.selected);
  const competitorLimitReached =
    maximumCompetitors === undefined || selectedCompetitors.length >= maximumCompetitors;

  return (
    <div className="grid w-full items-start gap-4 sm:grid-cols-2">
      <div className="contents">
        {/* Card 1: Your Domains */}
        <div className="bg-panel border-border-subtle/80 space-y-2.5 rounded-xl border p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted text-xs font-semibold tracking-wider uppercase">
              Your Domains
            </span>
            <Badge variant="neutral" className="px-2 py-0.5 text-xs">
              {selectedDomains.length} selected
            </Badge>
          </div>
          {domains.length === 0 ? (
            <p className="website-body text-muted italic">No domains were discovered.</p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {domains.map((entry, index) => (
                <DomainChip
                  key={entry.domain}
                  label={entry.domain}
                  selected={entry.selected}
                  onToggle={() => onToggleDomain(index)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Card 2: Competitors — Sleek Single-Line Chips */}
        <div className="bg-panel border-border-subtle/80 space-y-3 rounded-xl border p-4 shadow-xs sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-muted text-xs font-semibold tracking-wider uppercase">
              Competitors
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="neutral" className="px-2 py-0.5 text-xs">
                {selectedCompetitors.length} of {maximumCompetitors ?? '…'}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddCompetitor}
                disabled={competitorLimitReached}
                className="text-accent-text hover:bg-accent-soft border-accent-border/60 h-6 gap-1 rounded-lg border border-dashed px-2.5 text-xs font-medium"
              >
                <Plus className="size-3.5" aria-hidden />
                Add competitor
              </Button>
            </div>
          </div>

          {/* 2-Column Grid for Competitor Chips */}
          {competitors.length === 0 ? (
            <p className="website-body text-muted italic">No competitors were discovered.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {competitors.map((competitor, index) => (
                <CompetitorChip
                  key={competitor.id}
                  competitor={competitor}
                  onToggle={() => onToggleCompetitor(index)}
                  onEditDomain={(domain) => onEditCompetitorDomain(index, domain)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
