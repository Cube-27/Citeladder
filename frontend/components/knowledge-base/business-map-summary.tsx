'use client';

import { useQuery } from '@tanstack/react-query';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChipList } from '@/components/ui/chip-list-field';
import { FactList, type Fact } from '@/components/ui/facts';
import { Stack } from '@/components/ui/layout';
import { panelClasses } from '@/components/ui/panel';
import { QueryState } from '@/components/ui/query-state';
import { readErrorProps } from '@/components/ui/read-error';
import { textRole } from '@/components/ui/typography';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import type { BrandProfile } from '@/lib/api/types';
import {
  businessDraft,
  showsServiceAreas,
  type MapEntryDraft,
} from '@/lib/prompts/builder-business';
import { BUSINESS_MODEL_CHOICES } from '@/lib/project/identity-facets';
import { PROMPTS_GENERATE_HREF } from '@/lib/prompts/routes';

/** A list's values as chips. */
const chips = (values: readonly string[]) => (
  <ChipList items={values.map((value) => ({ value }))} />
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
function businessModelValue(profile: BrandProfile) {
  const saved = profile.business_context.business_model;
  const choice = BUSINESS_MODEL_CHOICES.find((option) => option.value === saved);
  if (choice) return choice.label;
  return <UnavailableValue state={saved == null || saved === '' ? 'not_set' : 'unknown'} />;
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
    <Card aria-labelledby="business-map">
      <CardHeader
        actions={
          <Button asChild variant="secondary">
            <ProjectLink href={PROMPTS_GENERATE_HREF}>Edit in Prompt Builder</ProjectLink>
          </Button>
        }
      >
        <CardTitle id="business-map">Business map</CardTitle>
        <CardDescription>
          These details steer prompt generation. Edit them in the Prompt Builder.
        </CardDescription>
      </CardHeader>
      <BusinessMapBody projectId={projectId} workspaceId={workspaceId} profile={profile} />
    </Card>
  );
}

function BusinessMapBody({
  projectId,
  workspaceId,
  profile,
}: Readonly<{ projectId: string; workspaceId: string; profile: BrandProfile }>) {
  const query = useQuery({
    queryKey: queryKeys.projects.businessMap(projectId),
    queryFn: ({ signal }) => projectsApi.getBusinessMap(projectId, { signal, workspaceId }),
  });
  if (query.isPending) return <QueryState kind="loading" label="Loading the business map" />;
  if (query.isError)
    return (
      <QueryState
        kind="error"
        {...readErrorProps(query)}
        fallback="The business map could not be loaded."
      />
    );
  const draft = businessDraft(profile, query.data);
  const facts: Fact[] = [
    { label: 'Buyer roles', value: chips(draft.buyerRoles) },
    ...(showsServiceAreas(profile.business_context)
      ? [{ label: 'Service areas', value: chips(draft.serviceAreas) }]
      : []),
    { label: 'Category terms', value: chips(draft.categoryTerms) },
    { label: 'Jobs to be done', value: chips(draft.jobs) },
    { label: 'Business model', value: businessModelValue(profile) },
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
          className={panelClasses({ tone: 'tonal' })}
        >
          <h4 className={textRole('itemTitle')}>{map.offering}</h4>
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
