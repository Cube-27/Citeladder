import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import { Absence } from '@/components/ui/absence';
import { ChipInput, type ChipItem } from '@/components/ui/chip-input';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { textRole } from '@/components/ui/typography';
import type { PromptFormLimits } from '@citeladder/contracts';
import {
  showsServiceAreas,
  withOfferings,
  type BusinessDraft,
  type MapEntryDraft,
} from '@/lib/prompts/builder-business';
import { BUSINESS_MODEL_CHOICES } from '@/lib/project/identity-facets';
import { pluralCount } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { BuilderBusiness } from './use-builder-business';
import { StateBlock } from '@/components/ui/state-block';

/** The bounds the API enforces on this step's saves and the run note, from the prompt-set list. */
export type BusinessStepLimits = Pick<
  PromptFormLimits,
  'context_list_max_entries' | 'run_context_max_chars'
>;
type OfferingMap = BusinessDraft['maps'][number];
const chips = (values: readonly string[]): ChipItem[] => values.map((value) => ({ value }));
const values = (items: readonly ChipItem[]) => items.map((item) => item.value);
const entryChips = (entries: readonly MapEntryDraft[]): ChipItem[] =>
  entries.map((entry) => ({ value: entry.value, suggested: entry.review_state === 'suggested' }));
const entries = (items: readonly ChipItem[]): MapEntryDraft[] =>
  items.map((item) => ({
    value: item.value,
    review_state: item.suggested ? 'suggested' : 'confirmed',
  }));

/** One offering's buyers, buying situations and attributes, from the business map. */
function OfferingFacts({
  map,
  disabled,
  listMax,
  onChange,
}: Readonly<{
  map: OfferingMap;
  disabled: boolean;
  listMax: number;
  onChange: (map: OfferingMap) => void;
}>) {
  return (
    <div className="grid gap-4 *:max-w-160">
      <ChipInput
        label="Who buys it"
        items={entryChips(map.audiences)}
        onChange={(items) => onChange({ ...map, audiences: entries(items) })}
        placeholder="e.g. beginner golfers"
        disabled={disabled}
        max={listMax}
      />
      <ChipInput
        label="Situations and constraints"
        items={entryChips(map.situations)}
        onChange={(items) => onChange({ ...map, situations: entries(items) })}
        placeholder="e.g. small back garden"
        disabled={disabled}
        max={listMax}
      />
      <ChipInput
        label="Attributes"
        items={entryChips(map.attributes)}
        onChange={(items) => onChange({ ...map, attributes: entries(items) })}
        placeholder="e.g. returns the ball"
        disabled={disabled}
        max={listMax}
      />
    </div>
  );
}

/** A collapsed row's summary of its offering's facts. */
function offeringSummary(map: OfferingMap): string | null {
  if (map.audiences.length + map.situations.length + map.attributes.length === 0) return null;
  return [
    pluralCount(map.audiences.length, 'buyer'),
    pluralCount(map.situations.length, 'situation'),
    pluralCount(map.attributes.length, 'attribute'),
  ].join(' · ');
}

/** Scrolls the offering a link opened the builder on into view once it renders. */
const scrollIntoView = (node: HTMLElement | null) => node?.scrollIntoView({ block: 'start' });

/**
 * Every offering's facts as one list: a row per offering with a summary,
 * one row open at a time to its three lists.
 */
function OfferingList({
  maps,
  initialOffering,
  disabled,
  listMax,
  onChange,
}: Readonly<{
  maps: readonly OfferingMap[];
  initialOffering: string | null;
  disabled: boolean;
  listMax: number;
  onChange: (index: number, map: OfferingMap) => void;
}>) {
  const [open, setOpen] = useState(initialOffering);
  const baseId = useId();
  if (maps.length === 0) return null;
  return (
    <section aria-labelledby={`${baseId}-title`} className="grid gap-2">
      <h3 id={`${baseId}-title`} className={textRole('label')}>
        Offering details
      </h3>
      <ul className="divide-rule grid divide-y">
        {maps.map((map, index) => {
          const expanded = open === map.offering;
          const panelId = `${baseId}-${index}`;
          const summary = offeringSummary(map);
          return (
            <li
              key={map.offering}
              ref={map.offering === initialOffering ? scrollIntoView : undefined}
              className="grid scroll-mt-4"
            >
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : map.offering)}
                className="hover:overlay-hover rounded-control flex min-h-10 w-full min-w-0 items-center gap-3 px-2 text-left"
              >
                <span className={textRole('label', 'text-ink shrink-0')}>{map.offering}</span>
                <span className={textRole('caption', 'text-ink-2 min-w-0 flex-1 truncate')}>
                  {summary ?? <Absence state="not_set" />}
                </span>
                <Icon
                  icon={ChevronDown}
                  className={cn(
                    'text-ink-2 shrink-0 transition-transform',
                    expanded && 'rotate-180',
                  )}
                />
              </button>
              <div id={panelId} hidden={!expanded} className="bg-well rounded-control mb-2 p-4">
                {expanded ? (
                  <OfferingFacts
                    map={map}
                    disabled={disabled}
                    listMax={listMax}
                    onChange={(next) => onChange(index, next)}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Step 1: what the business sells, who buys it and the situations that shape
 * a purchase, prefilled from saved brand knowledge. Edits save to the brand
 * profile and business map; the run note applies to this run only.
 */
export function BuilderBusinessStep({
  business,
  runContext,
  onRunContextChange,
  limits,
  initialOffering = null,
}: Readonly<{
  business: BuilderBusiness;
  runContext: string;
  onRunContextChange: (value: string) => void;
  limits: BusinessStepLimits;
  /** The offering a link opened the builder on: open and in view. */
  initialOffering?: string | null;
}>) {
  const listMax = limits.context_list_max_entries;
  const { draft, profile, map } = business;
  if (business.loading) return <StateBlock kind="loading" label="Loading your business details" />;
  if (business.loadError || !draft || !profile || !map)
    return (
      <StateBlock
        kind="error"
        error={business.loadError}
        title="Couldn't load your business details"
        fallback="The request failed or timed out."
        onRetry={business.retry}
        pending={business.retrying}
      />
    );
  const disabled = business.save.isPending;
  const set = (next: Partial<BusinessDraft>) => business.setDraft({ ...draft, ...next });
  return (
    <Stack gap="section">
      <ChipInput
        label="What you sell"
        hint="One offering per entry, named as a buyer would."
        items={chips(draft.offerings)}
        onChange={(items) => business.setDraft(withOfferings(draft, values(items), map))}
        placeholder="e.g. golf practice nets"
        disabled={disabled}
      />
      <ChipInput
        label="Buyer roles"
        hint="Who decides or pays, across everything you sell."
        items={chips(draft.buyerRoles)}
        onChange={(items) => set({ buyerRoles: values(items) })}
        placeholder="e.g. club coach"
        disabled={disabled}
        max={listMax}
      />
      <OfferingList
        maps={draft.maps}
        initialOffering={initialOffering}
        disabled={disabled}
        listMax={listMax}
        onChange={(index, next) =>
          set({ maps: draft.maps.map((item, i) => (i === index ? next : item)) })
        }
      />
      {showsServiceAreas(profile.business_context) ? (
        <ChipInput
          label="Service areas"
          hint="Places you serve; prompts name them only for a local or regional business."
          items={chips(draft.serviceAreas)}
          onChange={(items) => set({ serviceAreas: values(items) })}
          placeholder="e.g. Leeds"
          disabled={disabled}
          max={listMax}
        />
      ) : null}
      <ChipInput
        label="Category terms"
        hint="Words buyers use for what you sell, never a product-line name."
        items={chips(draft.categoryTerms)}
        onChange={(items) => set({ categoryTerms: values(items) })}
        placeholder="e.g. golf net"
        disabled={disabled}
        max={listMax}
      />
      <ChipInput
        label="Jobs to be done"
        hint="What buyers are trying to get done."
        items={chips(draft.jobs)}
        onChange={(items) => set({ jobs: values(items) })}
        placeholder="e.g. practise driving at home"
        disabled={disabled}
        max={listMax}
      />
      <Field label="Business model">
        {(field) => (
          <Select
            id={field.id}
            ariaLabel="Business model"
            placeholder="Not set"
            value={draft.businessModel ?? undefined}
            options={BUSINESS_MODEL_CHOICES}
            disabled={disabled}
            onValueChange={(businessModel) => set({ businessModel })}
          />
        )}
      </Field>
      <Field
        label="Anything else for this run"
        hint="Applies to this run only; it is never saved as a business fact."
      >
        {(field) => (
          <Input
            {...field}
            value={runContext}
            maxLength={limits.run_context_max_chars}
            placeholder="e.g. focus on winter practice"
            onChange={(event) => onRunContextChange(event.target.value)}
          />
        )}
      </Field>
    </Stack>
  );
}
