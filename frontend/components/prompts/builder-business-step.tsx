import { useState } from 'react';

import { Absence } from '@/components/ui/absence';
import { AccordionItem, AccordionList } from '@/components/ui/accordion-list';
import { ChipInput, type ChipItem } from '@/components/ui/chip-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Stack } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import type { PromptFormLimits } from '@citeladder/contracts';
import {
  showsServiceAreas,
  withOfferings,
  type BusinessDraft,
  type MapEntryDraft,
} from '@/lib/prompts/builder-business';
import { BUSINESS_MODEL_CHOICES } from '@/lib/project/identity-facets';
import { formatCount, pluralCount } from '@/lib/format';

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
    <>
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
    </>
  );
}

/** A collapsed row's summary of its offering's facts; unreviewed entries are counted apart. */
function offeringSummary(map: OfferingMap): string | null {
  if (map.audiences.length + map.situations.length + map.attributes.length === 0) return null;
  const suggested = [...map.audiences, ...map.situations, ...map.attributes].filter(
    (entry) => entry.review_state === 'suggested',
  ).length;
  return [
    pluralCount(map.audiences.length, 'buyer'),
    pluralCount(map.situations.length, 'situation'),
    pluralCount(map.attributes.length, 'attribute'),
    ...(suggested > 0 ? [`${formatCount(suggested)} suggested`] : []),
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
  if (maps.length === 0) return null;
  return (
    <AccordionList label="Offering details">
      {maps.map((map, index) => {
        const expanded = open === map.offering;
        return (
          <AccordionItem
            key={map.offering}
            itemRef={map.offering === initialOffering ? scrollIntoView : undefined}
            title={map.offering}
            caption={offeringSummary(map) ?? <Absence state="not_set" />}
            open={expanded}
            onToggle={() => setOpen(expanded ? null : map.offering)}
          >
            <OfferingFacts
              map={map}
              disabled={disabled}
              listMax={listMax}
              onChange={(next) => onChange(index, next)}
            />
          </AccordionItem>
        );
      })}
    </AccordionList>
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
  if (business.loading)
    return (
      <StateBlock
        kind="loading"
        label="Loading your business details"
        shape={{ kind: 'facts', rows: 5 }}
      />
    );
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
        items={chips(draft.offerings)}
        onChange={(items) => business.setDraft(withOfferings(draft, values(items), map))}
        placeholder="e.g. golf practice nets"
        disabled={disabled}
      />
      <ChipInput
        label="Buyer roles"
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
          hint="Named only for a local or regional business."
          items={chips(draft.serviceAreas)}
          onChange={(items) => set({ serviceAreas: values(items) })}
          placeholder="e.g. Leeds"
          disabled={disabled}
          max={listMax}
        />
      ) : null}
      <ChipInput
        label="Category terms"
        hint="Never a product-line name."
        items={chips(draft.categoryTerms)}
        onChange={(items) => set({ categoryTerms: values(items) })}
        placeholder="e.g. golf net"
        disabled={disabled}
        max={listMax}
      />
      <ChipInput
        label="Jobs to be done"
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
      <Field label="Anything else for this run" hint="Never saved as a business fact.">
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
