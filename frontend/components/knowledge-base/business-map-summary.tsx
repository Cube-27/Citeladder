import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { ProjectLink } from '@/components/ui/project-link';
import { Button } from '@/components/ui/button';
import { ChipList } from '@/components/ui/chip-input';
import { FactList, type Fact } from '@/components/ui/facts';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { Absence } from '@/components/ui/absence';
import { projectQueries } from '@/lib/api/projects';
import type { BrandProfile } from '@citeladder/contracts';
import {
  businessDraft,
  showsServiceAreas,
  type MapEntryDraft,
} from '@/lib/prompts/builder-business';
import { BUSINESS_MODEL_CHOICES } from '@/lib/project/identity-facets';
import { PROMPTS_GENERATE_HREF } from '@/lib/prompts/routes';
import { StateBlock, screenState } from '@/components/ui/state-block';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { wellClasses } from '@/components/ui/slip';

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

/** A list's values as chips; an inferred list reads as suggestions until a person saves it. */
const chips = (values: readonly string[], suggested: boolean) => (
  <ChipList items={values.map((value) => ({ value, suggested }))} />
);
/** A map's entries as chips; a suggestion says so until a person confirms it. */
const entryChips = (entries: readonly MapEntryDraft[]) => (
  <ChipList
    items={entries.map((entry) => ({
      value: entry.value,
      suggested: entry.review_state === 'suggested',
    }))}
  />
);
/** The saved business model's label; a saved value this app does not recognize stays distinct from none. */
function businessModelValue(profile: BrandProfile, suggested: boolean) {
  const saved = profile.business_context.business_model;
  const choice = BUSINESS_MODEL_CHOICES.find((option) => option.value === saved);
  if (choice) return <ChipList items={[{ value: choice.label, suggested }]} />;
  return <Absence state={saved == null || saved === '' ? 'not_set' : 'unknown'} />;
}

/**
 * The business facts that steer prompt generation, read-only on one card: the
 * Prompt Builder's first step owns editing them, and the card links there.
 * Each offering's map is a nested panel inside the card.
 */
export function BusinessMapSummary({
  projectId,
  workspaceId,
  profile,
}: Readonly<{ projectId: string; workspaceId: string; profile: BrandProfile }>) {
  return (
    <Section aria-labelledby="business-map">
      <SectionHeader
        actions={
          <Button asChild variant="secondary">
            <ProjectLink href={PROMPTS_GENERATE_HREF}>Edit in Prompt Builder</ProjectLink>
          </Button>
        }
      >
        <SectionTitle id="business-map">Business map</SectionTitle>
        <SectionDescription>
          These details steer prompt generation. Edit them in the Prompt Builder.
        </SectionDescription>
      </SectionHeader>
      <BusinessMapBody projectId={projectId} workspaceId={workspaceId} profile={profile} />
    </Section>
  );
}

function BusinessMapBody({
  projectId,
  workspaceId,
  profile,
}: Readonly<{ projectId: string; workspaceId: string; profile: BrandProfile }>) {
  const read = screenState(useQuery(projectQueries.businessMap({ workspaceId, projectId })), {
    subject: 'the business map',
  });
  if (read.kind === 'state') return <StateBlock {...read.state} />;
  const draft = businessDraft(profile, read.data);
  const inferred = inferredFields(profile);
  const facts: Fact[] = [
    { label: 'Buyer roles', value: chips(draft.buyerRoles, inferred('buyer_roles')) },
    ...(showsServiceAreas(profile.business_context)
      ? [
          {
            label: 'Service areas',
            value: chips(draft.serviceAreas, inferred('service_areas')),
          },
        ]
      : []),
    { label: 'Category terms', value: chips(draft.categoryTerms, inferred('category_terms')) },
    { label: 'Jobs to be done', value: chips(draft.jobs, inferred('jobs_to_be_done')) },
    {
      label: 'Business model',
      value: businessModelValue(profile, inferred('business_model')),
    },
  ];
  return (
    <Stack gap="workspace">
      <FactList layout="ruled" label="Business details" facts={facts} />
      {draft.maps.map((map) => (
        <Stack
          as="section"
          key={map.offering}
          aria-label={map.offering}
          gap="compact"
          className={wellClasses()}
        >
          <h4 className={textRole('subheading')}>{map.offering}</h4>
          <FactList
            layout="ruled"
            facts={[
              { label: 'Who buys it', value: entryChips(map.audiences) },
              { label: 'Situations and constraints', value: entryChips(map.situations) },
              { label: 'Attributes', value: entryChips(map.attributes) },
            ]}
          />
        </Stack>
      ))}
    </Stack>
  );
}
