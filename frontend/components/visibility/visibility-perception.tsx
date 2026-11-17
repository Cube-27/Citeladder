import type {
  PerceptionCoverage,
  PerceptionQuote,
  PerceptionResponse,
} from '@citeladder/contracts/visibility-perception';
import { MessageSquareQuote } from 'lucide-react';
import type { ComponentProps } from 'react';

import { AppGrid } from '@/components/ui/app-grid';
import { StatusMark } from '@/components/ui/status-mark';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Inline, Stack } from '@/components/ui/layout';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow, YouTag } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { Absence } from '@/components/ui/absence';
import { useEngineCatalog } from '@/lib/providers/engines';
import {
  coverageLine,
  formatNet,
  formatShare,
  stateCopy,
  themeLabel,
} from '@/lib/visibility/perception';
import { usePerception } from '@/lib/visibility/use-perception';
import type { SourceFilters } from '@/components/visibility/source-rows';
import type { SourceQueries } from '@/lib/visibility/use-source-analysis';
import { AnalysisRead } from '@/components/visibility/selection-gate';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionContent, TitledSection, SectionStack } from '@/components/ui/section';
import { FigureStrip } from '@/components/ui/figure-strip';

/**
 * How answers portray the brand and its competitors. Every figure travels with
 * the coverage it was computed over, and a missing classification is a named
 * state, never a zero.
 */
export function VisibilityPerception({
  filters,
  queries,
}: Readonly<{ filters: SourceFilters; queries: SourceQueries }>) {
  const query = usePerception(filters, queries);
  return (
    <AnalysisRead
      query={query}
      title="Couldn't load perception"
      busyLabel="Updating perception"
      busy={query.isFetching}
      ready={query.data}
    >
      {(data) => <PerceptionView data={data} />}
    </AnalysisRead>
  );
}

export function PerceptionView({ data }: Readonly<{ data: PerceptionResponse }>) {
  if (data.state !== 'value')
    return <PerceptionState state={data.state} reason={data.reason} coverage={data.coverage} />;
  return (
    <SectionStack>
      <Headline data={data} />
      <EntityTable entities={data.entities} />
      <ThemeTable themes={data.themes} />
      {/* The criticism and the sources cited beside it are one question; the
          two-column table sits beside the quotes where the width allows. */}
      <AppGrid layout="halves">
        <NegativeQuotes quotes={data.negative_quotes} />
        <DriverTable drivers={data.drivers} />
      </AppGrid>
    </SectionStack>
  );
}

/** A read with no value to show: pending, unavailable with its reason, or no mentions. */
function PerceptionState({
  state,
  reason,
  coverage,
}: Readonly<{
  state: Exclude<PerceptionResponse['state'], 'value'>;
  reason: PerceptionResponse['reason'];
  coverage?: PerceptionCoverage;
}>) {
  const copy = stateCopy(state, reason);
  // One state box at the shared footprint: the coverage it read is part of
  // the same sentence, not a caption that grows the box.
  return (
    <StateBlock
      kind="empty"
      headingLevel={3}
      icon={MessageSquareQuote}
      heading={copy.heading}
      description={
        coverage?.mentions ? `${copy.description} ${coverageLine(coverage)}.` : copy.description
      }
    />
  );
}

function CoverageNote({ coverage }: Readonly<{ coverage: PerceptionCoverage }>) {
  return <p className={textRole('caption', 'text-ink-2')}>{coverageLine(coverage)}</p>;
}

function Headline({ data }: Readonly<{ data: PerceptionResponse }>) {
  const score = data.brand?.score;
  const recommended = data.recommended;
  return (
    // Stat cards on the ground: the strip is never a card inside a card.
    <Section variant="group">
      <SectionContent>
        <Stack gap="item">
          <FigureStrip
            label="Brand perception"
            segments={[
              {
                key: 'net',
                label: 'Net sentiment',
                value: formatNet(score?.net_sentiment ?? null),
                missingLabel: 'Unavailable',
                sub: 'Positive minus negative, of classified mentions (−100 to +100).',
              },
              {
                key: 'positive',
                label: 'Positive',
                value: formatShare(score?.positive_share ?? null),
                missingLabel: 'Unavailable',
                sub: classifiedOf(score?.positive, score?.classified),
              },
              {
                key: 'negative',
                label: 'Negative',
                value: formatShare(score?.negative_share ?? null),
                missingLabel: 'Unavailable',
                sub: classifiedOf(score?.negative, score?.classified),
              },
              {
                key: 'recommended',
                label: 'Recommended',
                value: formatShare(recommended.rate),
                missingLabel: 'Unavailable',
                sub:
                  `${recommended.recommended} of ${recommended.mentioned} answers naming you` +
                  (recommended.recommended_against
                    ? `; ${recommended.recommended_against} advised against`
                    : ''),
              },
            ]}
          />
          <CoverageNote coverage={data.coverage} />
        </Stack>
      </SectionContent>
    </Section>
  );
}

/**
 * "3 of 4 classified mentions", or the unavailable mark when the brand has no
 * score: an unknown count is never printed as a zero.
 */
function classifiedOf(count: number | undefined, classified: number | undefined) {
  if (count === undefined || classified === undefined) return <Absence />;
  return `${count} of ${classified} classified mentions`;
}

function EntityTable({ entities }: Readonly<{ entities: PerceptionResponse['entities'] }>) {
  return (
    <TitledSection title="You and competitors">
      <DataTable
        label="You and competitors"
        columns={ENTITY_COLUMNS}
        footer="Classified mentions of each business in the selected answers."
      >
        {entities.map((entity) => (
          // Your own row is highlighted, as in the Trends brand table.
          <TableRow key={entity.name} highlight={entity.is_brand}>
            <TableCell>
              <Inline as="span">
                <ClampText>{entity.name}</ClampText>
                {entity.is_brand ? <YouTag /> : null}
              </Inline>
            </TableCell>
            <TableCell numeric>
              {entity.score.classified} of {entity.coverage.mentions}
            </TableCell>
            <TableCell numeric>{entity.score.positive}</TableCell>
            <TableCell numeric>{entity.score.negative}</TableCell>
            <TableCell numeric>{formatNet(entity.score.net_sentiment) ?? <Absence />}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

const ENTITY_COLUMNS: readonly DataTableColumn[] = [
  { key: 'business', label: 'Business' },
  { key: 'classified', label: 'Classified', width: 'figure', kind: 'number' },
  { key: 'positive', label: 'Positive', width: 'figure', kind: 'number' },
  { key: 'negative', label: 'Negative', width: 'figure', kind: 'number' },
  { key: 'net', label: 'Net sentiment', width: 'figure', kind: 'number' },
];

const THEME_COLUMNS: readonly DataTableColumn[] = [
  { key: 'theme', label: 'Theme', width: 'name' },
  { key: 'positive', label: 'Positive', width: 'figure', kind: 'number' },
  { key: 'negative', label: 'Negative', width: 'figure', kind: 'number' },
  { key: 'quote', label: 'Top quote' },
];

/** A table with nothing to list says so in one line, not a block state. */
function noneHere(message: string): ComponentProps<typeof DataTable>['state'] {
  return { kind: 'empty', inline: true, message };
}

function ThemeTable({ themes }: Readonly<{ themes: PerceptionResponse['themes'] }>) {
  return (
    <TitledSection title="Themes">
      <DataTable
        label="Themes"
        columns={THEME_COLUMNS}
        footer="What answers praised or criticised about you, with a verified quote."
        state={themes.length ? undefined : noneHere('No themes in these answers.')}
      >
        {themes.map((theme) => (
          <TableRow key={theme.theme}>
            <TableCell>{themeLabel(theme.theme)}</TableCell>
            <TableCell numeric>{theme.positive}</TableCell>
            <TableCell numeric>{theme.negative}</TableCell>
            <TableCell>
              {theme.quotes[0] ? (
                <ClampText tooltip={`“${theme.quotes[0].text}”`}>
                  <QuoteLink quote={theme.quotes[0]} />
                </ClampText>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

function QuoteLink({ quote }: Readonly<{ quote: PerceptionQuote }>) {
  return (
    <TextLink href={`/runs/${quote.run_id}?execution=${quote.execution_id}`}>
      “{quote.text}”
    </TextLink>
  );
}

function NegativeQuotes({ quotes }: Readonly<{ quotes: PerceptionQuote[] }>) {
  const { label: engineLabel } = useEngineCatalog();
  return (
    <TitledSection
      title="Criticism in answers"
      description="Negative points about you, quoted exactly as the answer put them."
    >
      <SectionContent>
        {!quotes.length ? (
          <StateBlock
            kind="empty"
            inline
            message="No negative points about you in these answers."
          />
        ) : (
          <Stack as="ul">
            {quotes.map((quote) => (
              <Stack as="li" gap="tight" key={`${quote.execution_id}:${quote.text}`}>
                <QuoteLink quote={quote} />
                <Inline as="span" className={textRole('caption', 'text-ink-2 flex-wrap')}>
                  <StatusMark variant="sentiment" value="negative">
                    {themeLabel(quote.theme)}
                  </StatusMark>
                  {engineLabel(quote.logical_engine)} · {quote.prompt}
                </Inline>
              </Stack>
            ))}
          </Stack>
        )}
      </SectionContent>
    </TitledSection>
  );
}

function DriverTable({ drivers }: Readonly<{ drivers: PerceptionResponse['drivers'] }>) {
  return (
    <TitledSection title="Sources cited alongside criticism">
      <DataTable
        label="Sources cited alongside criticism"
        columns={[
          { key: 'domain', label: 'Domain' },
          { key: 'answers', label: 'Answers', width: 'figure', kind: 'number' },
        ]}
        footer="Domains cited in answers that criticised you. Cited alongside, not shown to be the cause."
        state={drivers.length ? undefined : noneHere('No sources cited alongside criticism.')}
      >
        {drivers.map((driver) => (
          <TableRow key={driver.domain}>
            <TableCell>
              <ClampText>{driver.domain}</ClampText>
            </TableCell>
            <TableCell numeric>{driver.answers}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}
