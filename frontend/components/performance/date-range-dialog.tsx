'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import type { PerformanceCompare, PerformanceRange } from '@/lib/api/performance';
import { COMPARE_OPTIONS, RANGE_OPTIONS } from '@/lib/performance/performance';

/**
 * The Search-Console-shaped date dialog: a **Filter** tab that chooses the
 * range being viewed, and a **Compare** tab that chooses what it is measured
 * against.
 *
 * The dialog edits a DRAFT and only lifts it on Apply, so a half-typed date
 * never triggers a projection request. Year over year is disabled — with an
 * explicit reason — until the project has imported more than a year of
 * history: a first connect imports 365 days, so the comparison is genuinely
 * unavailable rather than zero, and offering it would render an empty window
 * that reads like a collapse in traffic.
 */

export type RangeSelection = {
  range: PerformanceRange;
  from: string;
  to: string;
  compare: PerformanceCompare;
  compareFrom: string;
  compareTo: string;
};

function isoDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Whether a draft is internally consistent enough to request. */
function isApplicable(draft: RangeSelection): boolean {
  if (draft.range === 'custom') {
    if (!isoDay(draft.from) || !isoDay(draft.to) || draft.to < draft.from) return false;
  }
  if (draft.compare === 'custom') {
    if (
      !isoDay(draft.compareFrom) ||
      !isoDay(draft.compareTo) ||
      draft.compareTo < draft.compareFrom
    )
      return false;
  }
  return true;
}

function DateRangeFields({
  legend,
  from,
  to,
  onFrom,
  onTo,
  min,
  max,
}: Readonly<{
  legend: string;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  min?: string;
  max?: string;
}>) {
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Start date" hint="YYYY-MM-DD">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={from}
              min={min}
              max={max}
              onChange={(event) => onFrom(event.target.value)}
            />
          )}
        </Field>
        <span className="text-muted pb-2">–</span>
        <Field label="End date" hint="YYYY-MM-DD">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={to}
              min={min}
              max={max}
              onChange={(event) => onTo(event.target.value)}
            />
          )}
        </Field>
      </div>
    </fieldset>
  );
}

export function DateRangeDialog({
  open,
  onOpenChange,
  selection,
  onApply,
  coverage,
  yearOverYearAvailable,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: RangeSelection;
  onApply: (selection: RangeSelection) => void;
  /** Imported evidence extent, used to bound the pickers honestly. */
  coverage: { earliest: string | null; latest: string | null };
  yearOverYearAvailable: boolean;
}>) {
  const [draft, setDraft] = useState(selection);
  const [tab, setTab] = useState<'filter' | 'compare'>('filter');
  // Re-seed on the CLOSED -> OPEN transition so a cancelled edit is truly
  // discarded. Tracked as state and adjusted during render (React's own
  // pattern for derived-from-props state) rather than in an effect, which
  // would render the stale draft once before correcting it.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(selection);
  }

  const patch = (next: Partial<RangeSelection>) => setDraft((current) => ({ ...current, ...next }));

  const compareOptions = COMPARE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    disabled: option.value === 'year_over_year' && !yearOverYearAvailable,
    description:
      option.value === 'year_over_year' && !yearOverYearAvailable
        ? 'Needs more than a year of imported history'
        : undefined,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Date range"
      description={
        coverage.earliest && coverage.latest
          ? `Imported history covers ${coverage.earliest} to ${coverage.latest}.`
          : 'No imported history yet.'
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!isApplicable(draft)}
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </div>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as 'filter' | 'compare')}
        items={[
          { value: 'filter', label: 'Filter' },
          { value: 'compare', label: 'Compare' },
        ]}
        ariaLabel="Date range mode"
        rootClassName="grid gap-4"
      >
        <TabPanel value="filter" className="grid gap-3">
          <RadioGroup
            ariaLabel="Date range"
            value={draft.range}
            onValueChange={(range) => patch({ range })}
            options={RANGE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          {draft.range === 'custom' ? (
            <DateRangeFields
              legend="Custom date range"
              from={draft.from}
              to={draft.to}
              min={coverage.earliest ?? undefined}
              max={coverage.latest ?? undefined}
              onFrom={(from) => patch({ from })}
              onTo={(to) => patch({ to })}
            />
          ) : null}
        </TabPanel>
        <TabPanel value="compare" className="grid gap-3">
          <RadioGroup
            ariaLabel="Comparison"
            value={draft.compare}
            onValueChange={(compare) => patch({ compare })}
            options={compareOptions}
          />
          {draft.compare === 'custom' ? (
            <DateRangeFields
              legend="Custom comparison range"
              from={draft.compareFrom}
              to={draft.compareTo}
              min={coverage.earliest ?? undefined}
              max={coverage.latest ?? undefined}
              onFrom={(compareFrom) => patch({ compareFrom })}
              onTo={(compareTo) => patch({ compareTo })}
            />
          ) : null}
        </TabPanel>
      </Tabs>
    </Dialog>
  );
}
