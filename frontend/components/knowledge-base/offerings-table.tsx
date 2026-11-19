import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Absence } from '@/components/ui/absence';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Stack } from '@/components/ui/layout';
import { ProjectLink } from '@/components/ui/project-link';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { availabilityLabel, pluralCount } from '@/lib/format';
import type { BusinessDraft, MapEntryDraft } from '@/lib/prompts/builder-business';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { promptBuilderOfferingHref } from '@/lib/prompts/routes';

type OfferingMap = BusinessDraft['maps'][number];

const FACTS = [
  { key: 'audiences', label: 'Who buys it', short: 'Who buys it' },
  { key: 'situations', label: 'Situations and constraints', short: 'Situations' },
  { key: 'attributes', label: 'Attributes', short: 'Attributes' },
] as const satisfies readonly { key: keyof OfferingMap; label: string; short: string }[];

// Below `desktop` the three fact columns fold into a caption under the offering.
const COLUMNS: readonly DataTableColumn[] = [
  { key: 'offering', label: 'Offering', kind: 'identity' },
  // Low priority: a column that does not fit hides, so the table never scrolls sideways.
  ...FACTS.map((fact) => ({
    key: fact.key,
    label: fact.label,
    desktopOnly: true,
    priority: 'low' as const,
  })),
];

const isSuggested = (entry: MapEntryDraft) => entry.review_state === 'suggested';

/**
 * A fact's entries on one line. A wholly suggested list says so once up
 * front; a mixed one marks each suggested entry, so the two stay told apart.
 */
function factText(entries: readonly MapEntryDraft[]): string | null {
  if (entries.length === 0) return null;
  const whole = entries.every(isSuggested);
  const joined = entries
    .map((entry) => (!whole && isSuggested(entry) ? `${entry.value} (suggested)` : entry.value))
    .join(', ');
  return whole ? `Suggested: ${joined}` : joined;
}

const NOT_SET = availabilityLabel('not_set');

/** The folded row's caption: every fact, by its short name. */
const foldedFacts = (map: OfferingMap) =>
  FACTS.map((fact) => `${fact.short}: ${factText(map[fact.key]) ?? NOT_SET}`).join(' · ');

function OfferingRow({ map }: Readonly<{ map: OfferingMap }>) {
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const href = promptBuilderOfferingHref(map.offering);
  const open = (event: MouseEvent<HTMLTableRowElement>) => {
    // The row's link handles its own press.
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    void navigate(projectHref(href));
  };
  return (
    <TableRow onClick={open} className="cursor-pointer">
      <TableCell>
        <Stack as="span" gap="tight" className="min-w-0">
          <ProjectLink href={href} className={textRole('label', 'text-ink block truncate')}>
            {map.offering}
          </ProjectLink>
          <ClampText lines={1} className={textRole('caption', 'desktop:hidden')}>
            {foldedFacts(map)}
          </ClampText>
        </Stack>
      </TableCell>
      {FACTS.map((fact) => (
        <TableCell key={fact.key} desktopOnly>
          {factText(map[fact.key]) ?? <Absence state="not_set" />}
        </TableCell>
      ))}
    </TableRow>
  );
}

/**
 * Every offering's facts as one table: a row per offering, its buyers,
 * situations and attributes across. A row opens that offering in the Prompt
 * Builder, which owns editing; a suggested entry says so in its cell.
 */
export function OfferingsTable({ maps }: Readonly<{ maps: readonly OfferingMap[] }>) {
  if (maps.length === 0) return null;
  const suggested = maps.some((map) => FACTS.some((fact) => map[fact.key].some(isSuggested)));
  return (
    <Section aria-labelledby="offerings">
      <SectionHeader>
        <SectionTitle id="offerings">Offerings</SectionTitle>
        <SectionDescription>
          {`${pluralCount(maps.length, 'offering')}. Who buys each one, when, and what matters to them.`}
          {suggested
            ? ' Entries marked suggested came from discovery and are not yet confirmed.'
            : null}
        </SectionDescription>
      </SectionHeader>
      <DataTable label="Offering facts" columns={COLUMNS}>
        {maps.map((map) => (
          <OfferingRow key={map.offering} map={map} />
        ))}
      </DataTable>
    </Section>
  );
}
