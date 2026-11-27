import { useState, type ClipboardEvent } from 'react';

import { Button, IconButton } from '@/components/ui/button';
import { ValuesInput, type ChipItem } from '@/components/ui/chip-input';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import {
  FactRow,
  BareInput,
  MapAddRow,
  MapGridCell,
  MapGridEnd,
  MapGridHead,
  MapGridLead,
  MapGridRow,
} from '@/components/ui/map-editor';
import { Notice } from '@/components/ui/notice';
import { Tag } from '@/components/ui/tag';
import { Select } from '@/components/ui/select';
import { SectionBleed } from '@/components/ui/section';
import { SettingsGroup } from '@/components/ui/setting-row';
import { Text } from '@/components/ui/typography';
import type { BusinessMap } from '@citeladder/contracts';
import { Check, X } from '@/lib/icons';
import { formatCount, pluralCount } from '@/lib/format';
import {
  acceptAll,
  acceptCell,
  showsServiceAreas,
  suggestionCount,
  withField,
  withOfferings,
  type BusinessDraft,
  type ContextListKey,
  type MapDimension,
  type MapEntryDraft,
} from '@/lib/prompts/builder-business';
import { BUSINESS_MODEL_CHOICES } from '@/lib/project/identity-facets';

type EditorProps = Readonly<{
  draft: BusinessDraft;
  onChange: (draft: BusinessDraft) => void;
  disabled: boolean;
  listMax: number;
}>;

type OfferingMap = BusinessDraft['maps'][number];

const DIMENSIONS = [
  { key: 'audiences', label: 'Who buys' },
  { key: 'situations', label: 'Situations' },
  { key: 'attributes', label: 'Attributes' },
] as const satisfies readonly { key: MapDimension; label: string }[];

const entryItems = (entries: readonly MapEntryDraft[]): ChipItem[] =>
  entries.map((entry) => ({ value: entry.value, suggested: entry.review_state === 'suggested' }));
const itemEntries = (items: readonly ChipItem[]): MapEntryDraft[] =>
  items.map((item) => ({
    value: item.value,
    review_state: item.suggested ? 'suggested' : 'confirmed',
  }));
const listItems = (values: readonly string[], suggested: boolean): ChipItem[] =>
  values.map((value) => ({ value, suggested }));

export function SuggestionsNotice({ draft, onChange, disabled }: Omit<EditorProps, 'listMax'>) {
  const count = suggestionCount(draft);
  if (!count) return null;
  return (
    <Notice
      action={
        <Button variant="secondary" disabled={disabled} onClick={() => onChange(acceptAll(draft))}>
          <Icon icon={Check} />
          Accept all
        </Button>
      }
    >
      {pluralCount(count, 'suggestion')}
    </Notice>
  );
}

function OfferingRow({
  map,
  disabled,
  listMax,
  onChange,
  onRemove,
}: Readonly<{
  map: OfferingMap;
  disabled: boolean;
  listMax: number;
  onChange: (map: OfferingMap) => void;
  onRemove: () => void;
}>) {
  return (
    <MapGridRow aria-label={map.offering}>
      <MapGridLead label={map.offering}>
        <IconButton
          icon={X}
          label={`Remove ${map.offering}`}
          disabled={disabled}
          onClick={onRemove}
          box="hide-split"
        />
      </MapGridLead>
      {DIMENSIONS.map((dimension) => (
        <MapGridCell key={dimension.key} label={dimension.label}>
          <ValuesInput
            variant="cell"
            separates="comma"
            label={`${dimension.label}: ${map.offering}`}
            items={entryItems(map[dimension.key])}
            onChange={(items) => onChange({ ...map, [dimension.key]: itemEntries(items) })}
            onAccept={() => onChange(acceptCell(map, dimension.key))}
            max={listMax}
            disabled={disabled}
          />
        </MapGridCell>
      ))}
      <MapGridEnd>
        <IconButton
          icon={X}
          label={`Remove ${map.offering}`}
          disabled={disabled}
          onClick={onRemove}
        />
      </MapGridEnd>
    </MapGridRow>
  );
}

function AddOffering({
  disabled,
  onAdd,
}: Readonly<{ disabled: boolean; onAdd: (names: string[]) => void }>) {
  const [name, setName] = useState('');
  const add = () => {
    if (!name.trim()) return;
    onAdd([name]);
    setName('');
  };
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const names = event.clipboardData.getData('text').split(/[\n\r]+/);
    if (names.length < 2) return;
    event.preventDefault();
    onAdd([name, ...names]);
    setName('');
  };
  return (
    <MapAddRow>
      <BareInput
        aria-label="Add offering"
        placeholder="Add offering"
        value={name}
        disabled={disabled}
        onChange={(event) => setName(event.target.value)}
        onBlur={add}
        onPaste={paste}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          add();
        }}
      />
    </MapAddRow>
  );
}

export function OfferingsGrid({
  draft,
  onChange,
  disabled,
  listMax,
  saved,
}: EditorProps &
  Readonly<{
    saved: BusinessMap;
  }>) {
  const setOfferings = (offerings: string[]) => onChange(withOfferings(draft, offerings, saved));
  const add = (names: string[]) => {
    const next = [...draft.offerings];
    for (const raw of names) {
      const name = raw.trim();
      if (name && !next.some((item) => item.toLowerCase() === name.toLowerCase())) next.push(name);
    }
    setOfferings(next);
  };
  return (
    <SettingsGroup
      title="Offerings"
      status={
        <Text variant="caption" numeric>
          {formatCount(draft.offerings.length)}
        </Text>
      }
    >
      <SectionBleed>
        <MapGridHead lead="Offering" heads={DIMENSIONS.map((dimension) => dimension.label)} />
        {draft.maps.length ? (
          <ul aria-label="Offerings" className="contents">
            {draft.maps.map((map, index) => (
              <OfferingRow
                key={map.offering}
                map={map}
                disabled={disabled}
                listMax={listMax}
                onChange={(next) =>
                  onChange({
                    ...draft,
                    maps: draft.maps.map((item, i) => (i === index ? next : item)),
                  })
                }
                onRemove={() =>
                  setOfferings(draft.offerings.filter((item) => item !== map.offering))
                }
              />
            ))}
          </ul>
        ) : null}
        <AddOffering disabled={disabled} onAdd={add} />
      </SectionBleed>
    </SettingsGroup>
  );
}

const LISTS = [
  { key: 'buyerRoles', label: 'Buyer roles' },
  { key: 'serviceAreas', label: 'Service areas' },
  { key: 'categoryTerms', label: 'Category terms' },
  { key: 'jobs', label: 'Jobs to be done' },
] as const satisfies readonly { key: ContextListKey; label: string }[];

export function BusinessFacts({
  draft,
  onChange,
  disabled,
  listMax,
  context,
}: EditorProps & Readonly<{ context: Record<string, unknown> }>) {
  const lists = LISTS.filter((list) => list.key !== 'serviceAreas' || showsServiceAreas(context));
  const savedModel = context.business_model;
  const unknownModel = typeof savedModel === 'string' && savedModel !== '' && !draft.businessModel;
  const accept = (key: ContextListKey | 'businessModel') =>
    onChange({ ...draft, suggested: draft.suggested.filter((item) => item !== key) });
  return (
    <SettingsGroup title="Business">
      <SectionBleed rows>
        {lists.map((list) => (
          <FactRow
            key={list.key}
            label={list.label}
            count={`${formatCount(draft[list.key].length)} of ${formatCount(listMax)}`}
          >
            <ValuesInput
              variant="cell"
              separates="comma"
              label={list.label}
              items={listItems(draft[list.key], draft.suggested.includes(list.key))}
              onChange={(items) =>
                onChange(
                  withField(
                    draft,
                    list.key,
                    items.map((item) => item.value),
                  ),
                )
              }
              onAccept={() => accept(list.key)}
              max={listMax}
              disabled={disabled}
            />
          </FactRow>
        ))}
        <FactRow label="Business model">
          <Inline>
            <Select
              ariaLabel="Business model"
              placeholder={unknownModel ? 'Unknown' : 'Not set'}
              value={draft.businessModel ?? undefined}
              options={BUSINESS_MODEL_CHOICES}
              disabled={disabled}
              onValueChange={(model) => onChange(withField(draft, 'businessModel', model))}
            />
            {draft.suggested.includes('businessModel') ? <Tag kind="draft">Suggested</Tag> : null}
            {draft.suggested.includes('businessModel') ? (
              <IconButton
                icon={Check}
                label="Accept Business model"
                disabled={disabled}
                onClick={() => accept('businessModel')}
              />
            ) : null}
          </Inline>
        </FactRow>
      </SectionBleed>
    </SettingsGroup>
  );
}
