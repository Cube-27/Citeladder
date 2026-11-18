import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { ProjectLink } from '@/components/ui/project-link';
import { Button } from '@/components/ui/button';
import { ChipList, type ChipItem } from '@/components/ui/chip-input';
import { DraftSheet } from '@/components/ui/draft-sheet';
import { FactList, type Fact } from '@/components/ui/facts';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { Absence } from '@/components/ui/absence';
import { projectQueries } from '@/lib/api/projects';
import type { BrandProfile } from '@citeladder/contracts';
import { businessDraft, showsServiceAreas } from '@/lib/prompts/builder-business';
import { BUSINESS_MODEL_CHOICES } from '@/lib/project/identity-facets';
import { PROMPT_BUILDER_HREF } from '@/lib/prompts/routes';
import { StateBlock, screenState } from '@/components/ui/state-block';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';

import { OfferingsTable } from './offerings-table';

const fieldSourcesSchema = z.record(z.string(), z.unknown());

/**
 * Whether a business-context field still holds what discovery inferred: only a
 * field a person has saved is `reviewed` in the context's `field_sources`.
 */
function inferredFields(profile: BrandProfile) {
  const parsed = fieldSourcesSchema.safeParse(profile.business_context.field_sources);
  const sources = parsed.success ? parsed.data : {};
  return (field: string) => sources[field] !== 'reviewed';
}

/** One row of a map group: its chips, and what it shows when it has none. */
type MapField = Readonly<{ label: string; items: readonly ChipItem[]; absent?: ReactNode }>;

/** A list's values; an inferred list is a suggestion until a person saves it. */
const listField = (label: string, values: readonly string[], suggested: boolean): MapField => ({
  label,
  items: values.map((value) => ({ value, suggested })),
});

/** The saved business model's label; a saved value this app does not recognize stays distinct from none. */
function businessModelField(profile: BrandProfile, suggested: boolean): MapField {
  const saved = profile.business_context.business_model;
  const choice = BUSINESS_MODEL_CHOICES.find((option) => option.value === saved);
  return {
    label: 'Business model',
    items: choice ? [{ value: choice.label, suggested }] : [],
    absent:
      saved == null || saved === '' ? (
        <Absence state="not_set" />
      ) : (
        <Absence state="unavailable" label="Unknown" />
      ),
  };
}

const allSuggested = (field: MapField) =>
  field.items.length > 0 && field.items.every((item) => item.suggested);

/**
 * A field's chips. A field that is wholly suggested is named once in its
 * group's head, so its chips drop the per-chip word; a field mixing confirmed
 * and suggested entries keeps it, so the two stay told apart.
 */
function fieldValue(field: MapField) {
  if (field.items.length === 0 && field.absent) return field.absent;
  const whole = allSuggested(field);
  return (
    <ChipList
      items={field.items.map((item) => ({
        value: item.value,
        suggested: !whole && item.suggested,
      }))}
    />
  );
}

/** What a draft group's head says once: which fields discovery suggested. */
function suggestionNote(fields: readonly MapField[]) {
  const whole = fields.filter(allSuggested).map((field) => field.label);
  const mixed = fields.some(
    (field) => !allSuggested(field) && field.items.some((item) => item.suggested),
  );
  const named = whole.length
    ? `Suggested by discovery and not yet confirmed: ${whole.join(', ')}.`
    : 'Suggested by discovery and not yet confirmed.';
  return mixed ? `${named} Entries marked Suggested are too.` : named;
}

/**
 * One group of the map as a card: plain once every value is confirmed, a
 * draft while any value is a suggestion (law 1), with the word said once.
 */
function MapGroup({
  title,
  description,
  label,
  fields,
  action,
}: Readonly<{
  title: string;
  description?: string;
  /** Names the fact list when the title does not. */
  label?: string;
  fields: readonly MapField[];
  action?: ReactNode;
}>) {
  const facts: Fact[] = fields.map((field) => ({ label: field.label, value: fieldValue(field) }));
  const list = <FactList layout="ruled" label={label} facts={facts} />;
  if (fields.some((field) => field.items.some((item) => item.suggested)))
    return (
      <DraftSheet title={title} state="draft" actions={action}>
        <p className={textRole('caption', 'max-w-[72ch]')}>
          {description ? `${description} ` : ''}
          {suggestionNote(fields)}
        </p>
        {list}
      </DraftSheet>
    );
  return (
    <Section aria-label={title}>
      <SectionHeader actions={action}>
        <SectionTitle>{title}</SectionTitle>
        {description ? <SectionDescription>{description}</SectionDescription> : null}
      </SectionHeader>
      {list}
    </Section>
  );
}

/**
 * The business facts that steer prompt generation, read-only: the business
 * details, then every offering's map as one table. The Prompt Builder's
 * first step owns editing them; both cards link there.
 */
export function BusinessMapSummary({
  projectId,
  workspaceId,
  profile,
}: Readonly<{ projectId: string; workspaceId: string; profile: BrandProfile }>) {
  const read = screenState(useQuery(projectQueries.businessMap({ workspaceId, projectId })), {
    subject: 'the business map',
    shape: { kind: 'list' },
  });
  const edit = (
    <Button asChild variant="secondary">
      <ProjectLink href={PROMPT_BUILDER_HREF}>
        <Icon icon={Pencil} />
        Edit in Prompt builder
      </ProjectLink>
    </Button>
  );
  if (read.kind === 'state')
    return (
      <Section aria-labelledby="business-map">
        <SectionHeader actions={edit}>
          <SectionTitle id="business-map">Business map</SectionTitle>
        </SectionHeader>
        <StateBlock {...read.state} />
      </Section>
    );
  const draft = businessDraft(profile, read.data);
  const inferred = inferredFields(profile);
  const details: MapField[] = [
    listField('Buyer roles', draft.buyerRoles, inferred('buyer_roles')),
    ...(showsServiceAreas(profile.business_context)
      ? [listField('Service areas', draft.serviceAreas, inferred('service_areas'))]
      : []),
    listField('Category terms', draft.categoryTerms, inferred('category_terms')),
    listField('Jobs to be done', draft.jobs, inferred('jobs_to_be_done')),
    businessModelField(profile, inferred('business_model')),
  ];
  return (
    <Stack gap="workspace">
      <MapGroup
        title="Business map"
        description="These details steer prompt generation."
        label="Business details"
        fields={details}
        action={edit}
      />
      <OfferingsTable maps={draft.maps} action={edit} />
    </Stack>
  );
}
