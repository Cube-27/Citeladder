import {
  factTopicSchema,
  type AccuracyClaim,
  type AccuracyCoverage,
  type AccuracyResponse,
} from '@citeladder/contracts/fact-checking';
import { ShieldCheck } from 'lucide-react';

import { AppGrid } from '@/components/ui/app-grid';
import { StatusMark } from '@/components/ui/status-mark';
import { DataTable } from '@/components/ui/data-table';
import { Inline, Stack } from '@/components/ui/layout';
import { BusyRung } from '@/components/ui/rung-meter';
import { Skeleton } from '@/components/ui/skeleton';
import { TableCell, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { Absence } from '@/components/ui/absence';
import type { SourceFilters } from '@/components/visibility/source-rows';
import {
  accuracyCoverageLine,
  accuracyStateCopy,
  TOPIC_LABELS,
  VERDICT_LABELS,
  VERDICT_TONE,
} from '@/lib/visibility/accuracy';
import { useEngineCatalog } from '@/lib/providers/engines';
import { formatShare } from '@/lib/visibility/perception';
import { useAccuracy } from '@/lib/visibility/use-accuracy';
import type { SourceQueries } from '@/lib/visibility/use-source-analysis';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
  TitledSection,
  SectionStack,
} from '@/components/ui/section';
import { FigureStrip } from '@/components/ui/figure-strip';

/**
 * What answers claimed about the brand, checked against its confirmed facts.
 * Accuracy always travels with its coverage, and a claim without a verdict is
 * a named state, never a zero.
 */
export function VisibilityAccuracy({
  filters,
  queries,
}: Readonly<{ filters: SourceFilters; queries: SourceQueries }>) {
  const query = useAccuracy(filters, queries);
  if (query.error)
    return (
      <Notice
        kind="read"
        error={query.error}
        title="Couldn't load the fact checks"
        fallback="Check your connection and try again."
        onRetry={() => void query.refetch()}
        pending={query.isFetching}
      />
    );
  // The selection above has settled on a measured run (`SelectionGate`), so
  // no data is this read still on its way.
  if (!query.data)
    return (
      <Stack gap="workspace" aria-busy>
        <Skeleton variant="block" />
        <Skeleton variant="chart" />
      </Stack>
    );
  return (
    <div className="relative">
      <BusyRung active={query.isFetching} label="Updating fact checks" />
      <AccuracyView data={query.data} />
    </div>
  );
}

export function AccuracyView({ data }: Readonly<{ data: AccuracyResponse }>) {
  const { label: engineLabel } = useEngineCatalog();
  if (data.state !== 'value')
    return <AccuracyState state={data.state} reason={data.reason} coverage={data.score.coverage} />;
  return (
    <SectionStack>
      <Headline data={data} />
      {/* The contradictions and the sources cited beside them are one
          question; the two-column table sits beside the claims where the
          width allows. */}
      <AppGrid layout="halves">
        <ContradictedClaims claims={data.contradicted} />
        <CitedTable cited={data.cited_alongside} />
      </AppGrid>
      <BreakdownTable title="By topic" column="Topic" rows={data.topics} label={topicLabel} />
      <BreakdownTable title="By engine" column="Engine" rows={data.engines} label={engineLabel} />
    </SectionStack>
  );
}

function topicLabel(key: string) {
  const topic = factTopicSchema.safeParse(key);
  return topic.success ? TOPIC_LABELS[topic.data] : key;
}

function AccuracyState({
  state,
  reason,
  coverage,
}: Readonly<{
  state: Exclude<AccuracyResponse['state'], 'value'>;
  reason: AccuracyResponse['reason'];
  coverage?: AccuracyCoverage;
}>) {
  const copy = accuracyStateCopy(state, reason);
  // One state box at the shared footprint: the coverage it read is part of
  // the same sentence, not a caption that grows the box.
  return (
    <StateBlock
      kind="empty"
      headingLevel={3}
      icon={ShieldCheck}
      heading={copy.heading}
      description={
        coverage?.claims
          ? `${copy.description} ${accuracyCoverageLine(coverage)}.`
          : copy.description
      }
    />
  );
}

function CoverageNote({ coverage }: Readonly<{ coverage: AccuracyCoverage }>) {
  return <p className={textRole('caption', 'text-ink-2')}>{accuracyCoverageLine(coverage)}</p>;
}

function Headline({ data }: Readonly<{ data: AccuracyResponse }>) {
  const { coverage } = data.score;
  return (
    <Section>
      <SectionContent>
        <Stack gap="item">
          <FigureStrip
            label="Fact checks"
            segments={[
              {
                key: 'accuracy',
                label: 'Accuracy',
                value: formatShare(data.score.accuracy),
                missingLabel: 'Unavailable',
                sub: 'Supported, of claims that were supported or contradicted.',
              },
              {
                key: 'supported',
                label: 'Supported',
                value: String(coverage.supported),
                sub: 'A confirmed fact states the same thing.',
              },
              {
                key: 'contradicted',
                label: 'Contradicted',
                value: String(coverage.contradicted),
                sub: 'A confirmed fact states something incompatible.',
              },
              // Two different findings: no confirmed fact on the point, and a
              // fact that could not settle the claim. Never one summed figure.
              {
                key: 'not_covered',
                label: VERDICT_LABELS.not_covered,
                value: String(coverage.not_covered),
                sub: 'No confirmed fact on the point.',
              },
              {
                key: 'inconclusive',
                label: VERDICT_LABELS.inconclusive,
                value: String(coverage.inconclusive),
                sub: 'A confirmed fact could not settle the claim.',
              },
            ]}
          />
          <CoverageNote coverage={coverage} />
        </Stack>
      </SectionContent>
    </Section>
  );
}

function ClaimLink({ claim }: Readonly<{ claim: AccuracyClaim }>) {
  return (
    <TextLink href={`/runs/${claim.run_id}?execution=${claim.execution_id}`}>
      “{claim.quote}”
    </TextLink>
  );
}

function ContradictedClaims({ claims }: Readonly<{ claims: AccuracyClaim[] }>) {
  const { label: engineLabel } = useEngineCatalog();
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Contradicted claims</SectionTitle>
        <SectionDescription>
          What answers said about you that a confirmed fact contradicts, quoted exactly.
        </SectionDescription>
      </SectionHeader>
      <SectionContent>
        {!claims.length ? (
          <StateBlock kind="empty" inline message="No contradicted claims in these answers." />
        ) : (
          <Stack as="ul">
            {claims.map((claim) => (
              <Stack as="li" gap="tight" key={`${claim.execution_id}:${claim.quote}`}>
                <ClaimLink claim={claim} />
                {claim.facts.map((fact) => (
                  <span key={fact.statement} className="type-caption text-ink-2">
                    Your fact: {fact.statement}
                  </span>
                ))}
                <Inline as="span" className={textRole('caption', 'text-ink-2 flex-wrap')}>
                  {/* The badge takes the claim's own verdict tone; a claim
                      without a verdict yet is neutral, not negative. */}
                  <StatusMark
                    variant="sentiment"
                    value={claim.verdict ? VERDICT_TONE[claim.verdict] : 'neutral'}
                  >
                    {TOPIC_LABELS[claim.topic]}
                  </StatusMark>
                  {engineLabel(claim.logical_engine)} · {claim.prompt}
                </Inline>
              </Stack>
            ))}
          </Stack>
        )}
      </SectionContent>
    </Section>
  );
}

function BreakdownTable({
  title,
  column,
  rows,
  label,
}: Readonly<{
  title: string;
  column: string;
  rows: AccuracyResponse['topics'];
  label: (key: string) => string;
}>) {
  if (!rows.length) return null;
  return (
    <TitledSection title={title}>
      <DataTable
        label={title}
        columns={[
          { key: 'key', label: column },
          { key: 'claims', label: 'Claims', width: 'figure', kind: 'number' },
          { key: 'supported', label: VERDICT_LABELS.supported, width: 'figure', kind: 'number' },
          {
            key: 'contradicted',
            label: VERDICT_LABELS.contradicted,
            width: 'figure',
            kind: 'number',
          },
          { key: 'accuracy', label: 'Accuracy', width: 'figure', kind: 'number' },
        ]}
      >
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>{label(row.key)}</TableCell>
            <TableCell numeric>{row.score.coverage.claims}</TableCell>
            <TableCell numeric>{row.score.coverage.supported}</TableCell>
            <TableCell numeric>{row.score.coverage.contradicted}</TableCell>
            <TableCell numeric>{formatShare(row.score.accuracy) ?? <Absence />}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

function CitedTable({ cited }: Readonly<{ cited: AccuracyResponse['cited_alongside'] }>) {
  return (
    <TitledSection title="Sources cited alongside contradictions">
      <DataTable
        label="Sources cited alongside contradictions"
        columns={[
          { key: 'domain', label: 'Domain' },
          { key: 'answers', label: 'Answers', width: 'figure', kind: 'number' },
        ]}
        footer="Domains cited in answers with a contradicted claim. Cited alongside, not shown to be the source."
        state={
          cited.length
            ? undefined
            : { kind: 'empty', inline: true, message: 'No sources cited alongside contradictions.' }
        }
      >
        {cited.map((row) => (
          <TableRow key={row.domain}>
            <TableCell>{row.domain}</TableCell>
            <TableCell numeric>{row.answers}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}
