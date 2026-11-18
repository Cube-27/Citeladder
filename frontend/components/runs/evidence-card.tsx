import { CheckCircle2, Quote, Search, XCircle } from 'lucide-react';

import { MeasurementContext } from '@/components/runs/measurement-context';
import { SurfaceEvidence } from '@/components/runs/surface-evidence';
import { BrandMark } from '@/components/ui/brand-mark';
import { StatusMark } from '@/components/ui/status-mark';
import { TextLink } from '@/components/ui/text-link';
import { Label, textRole } from '@/components/ui/typography';
import { useEngineCatalog } from '@/lib/providers/engines';
import type { ExecutionEvidence } from '@citeladder/contracts';
import { classificationBadgeValue, classificationLabel } from '@/lib/runs/status';
import { pluralCount } from '@/lib/format';

import { ContentMarkdown } from '@/lib/markdown/markdown';
import type { Highlight } from '@/lib/markdown/highlight';
import { claimHighlights, EvidenceClaims } from '@/components/runs/evidence-claims';
import { EvidencePerception, perceptionHighlights } from '@/components/runs/evidence-perception';
import { EvidenceAds } from '@/components/runs/evidence-ads';
import { AnswerFormatTags } from '@/components/runs/answer-formats';
import { Absence } from '@/components/ui/absence';
import { FactList } from '@/components/ui/facts';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { MetaFooter, SubsectionHeader } from '@/components/ui/workspace';
import { LedgerItem, LedgerList } from '@/components/ui/ledger-list';
import { StateBlock } from '@/components/ui/state-block';
import { wellClasses } from '@/components/ui/slip';

function safeCitationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function Outcome({
  label,
  detail,
  passed,
}: Readonly<{ label: string; detail: string; passed: boolean }>) {
  return (
    <Inline className={wellClasses('items-start')}>
      <Icon
        icon={passed ? CheckCircle2 : XCircle}
        className={passed ? 'text-positive' : 'text-ink-2'}
      />
      <div className="min-w-0">
        <p className={textRole('body')}>{label}</p>
        <p className="type-caption">{detail}</p>
      </div>
    </Inline>
  );
}

/**
 * How the answer was measured. The drawer's title is the prompt and the row
 * that opened it names the engine, so neither is repeated here.
 */
function EvidenceMeasurement({ evidence }: Readonly<{ evidence: ExecutionEvidence }>) {
  const engines = useEngineCatalog();
  return (
    <MeasurementContext
      retrieval={evidence.retrieval_enabled}
      model={engines.modelLabel(evidence.logical_engine, evidence.transport_model)}
    />
  );
}

/** The tracked business the answer named first (AV-7); untracked names never count. */
function namedFirst(first: ExecutionEvidence['first_named']) {
  switch (first.kind) {
    case 'brand':
    case 'competitor':
      return (
        <Inline gap="tight">
          <BrandMark name={first.name} placement="inline" />
          {first.name}
        </Inline>
      );
    case 'none':
      return 'No tracked brand';
    case 'unavailable':
      return 'Unavailable';
    default: {
      const unreachable: never = first;
      return unreachable;
    }
  }
}

/** Links written in the answer text, counted only where the stored page tells them from citations. */
function inTextLinks(formats: ExecutionEvidence['answer_formats']) {
  if (formats.kind === 'observed') return formats.in_text_links;
  return <Absence state={formats.kind} />;
}

function EvidenceMetrics({ evidence }: Readonly<{ evidence: ExecutionEvidence }>) {
  return (
    <FactList
      layout="ruled"
      facts={[
        { label: 'Brand', value: evidence.brand_mentioned ? 'Mentioned' : 'Not mentioned' },
        { label: 'Named first', value: namedFirst(evidence.first_named) },
        { label: 'Owned sources', value: evidence.owned_citation_count },
        {
          label: 'Answer formats',
          value: <AnswerFormatTags formats={evidence.answer_formats} />,
        },
        { label: 'In-text links', value: inTextLinks(evidence.answer_formats) },
        { label: 'Citations', value: evidence.citation_count },
        {
          label: 'Searches',
          value: evidence.search_used ? evidence.search_query_count : 'Not used',
        },
      ]}
    />
  );
}

const listItemBlock = /^ {0,3}(?:[-*+] |\d+[.)] )/;
const structuralBlock = /^ {0,3}(?:#{1,6} |[-*+] |\d+[.)] |>|```|~~~|\|)/;
const indentedBlock = /^(?: {4}|\t)/;
const sentenceEnd = /[.!?:;\])}"'…](?:[*_~]+)?$/;
const punctuationOnly = /^[,.;:!?)\]}]+(?:[*_~]+)?$/;
const commaFragment = /^,\s/;
const sentenceFragment = /^(?:\p{Ll}|\+\d)/u;

function joinsWithoutSpace(previous: string, block: string, content: string): boolean {
  return (
    listItemBlock.test(previous) &&
    !indentedBlock.test(block) &&
    (punctuationOnly.test(content) || commaFragment.test(content))
  );
}

function joinsWithSpace(previous: string, block: string, content: string): boolean {
  return (
    listItemBlock.test(previous) &&
    !indentedBlock.test(block) &&
    !structuralBlock.test(block) &&
    !sentenceEnd.test(previous) &&
    !sentenceEnd.test(content) &&
    sentenceFragment.test(content)
  );
}

/**
 * Repair paragraph breaks introduced around inline citation annotations.
 *
 * Some answer transports persist a list item as several blank-line-separated
 * fragments (including punctuation in a block of its own). Markdown correctly
 * treats those as separate paragraphs, but the reader sees a sentence pulled
 * apart vertically. This changes only the rendered copy: the persisted answer
 * remains the immutable evidence and proper Markdown blocks remain untouched.
 */
export function normalizeEvidenceMarkdown(markdown: string): string {
  const blocks = markdown
    .replaceAll('\r\n', '\n')
    .split(/\n{2,}/)
    .map((block) => block.trimEnd())
    .filter((block) => block.trim());
  const normalized: string[] = [];

  for (const block of blocks) {
    const previous = normalized.at(-1);
    if (!previous) {
      normalized.push(block);
      continue;
    }
    const blockContent = block.trimStart();
    if (joinsWithoutSpace(previous, block, blockContent)) {
      normalized[normalized.length - 1] = `${previous}${blockContent}`;
      continue;
    }
    if (joinsWithSpace(previous, block, blockContent)) {
      normalized[normalized.length - 1] = `${previous} ${blockContent}`;
      continue;
    }
    normalized.push(block);
  }

  return normalized.join('\n\n');
}

function EvidenceAnswer({
  answerText,
  isSearchSurface,
  outcome,
  highlights,
}: Readonly<{
  answerText?: string | null;
  isSearchSurface?: boolean;
  outcome?: string;
  highlights: readonly Highlight[];
}>) {
  const trimmed = answerText?.trim();
  // An observed surface with no text is two completely different things, and
  // only the persisted OUTCOME separates them. Inferring from "succeeded and
  // empty" was wrong: an overview that was present but carried no extractable
  // text produces exactly that, and would have been reported as Google
  // showing nothing — our own gap presented as the brand's absence.
  const measuredAbsence = Boolean(isSearchSurface) && outcome === 'no_ai_overview';
  return (
    <Stack as="section" gap="item">
      <Label>{isSearchSurface ? 'AI Overview' : 'Engine response'}</Label>
      <div className={wellClasses('min-w-0 overflow-hidden')}>
        <EvidenceAnswerBody
          text={trimmed}
          measuredAbsence={measuredAbsence}
          highlights={highlights}
        />
      </div>
    </Stack>
  );
}

/**
 * The three states an answer panel can be in, named rather than nested.
 *
 * They are genuinely three, not two: text, a measured absence, and a missing
 * capture. The middle one is a finding and the last one is a gap in ours, so
 * they must never share a sentence.
 */
function EvidenceAnswerBody({
  text,
  measuredAbsence,
  highlights,
}: Readonly<{ text?: string; measuredAbsence: boolean; highlights: readonly Highlight[] }>) {
  if (text) {
    return (
      <ContentMarkdown
        markdown={normalizeEvidenceMarkdown(text)}
        density="compact"
        highlights={highlights}
      />
    );
  }
  if (measuredAbsence) {
    return <span className="type-body text-ink-2">No AI Overview was shown for this search.</span>;
  }
  return (
    <span className="type-body text-ink-2">No answer text was captured for this execution.</span>
  );
}

function brandOutcomeDetail(evidence: ExecutionEvidence): string {
  if (!evidence.brand_mentioned) return 'No tracked brand alias appeared in the answer';
  if (evidence.brand_first_offset === null) return 'Brand detected; match position unavailable';
  return `First match at character ${evidence.brand_first_offset}`;
}

function EvidenceOutcomes({ evidence }: Readonly<{ evidence: ExecutionEvidence }>) {
  const brandDetail = brandOutcomeDetail(evidence);
  const ownedNoun = evidence.owned_citation_count === 1 ? 'source' : 'sources';
  const ownedDetail = `${evidence.owned_citation_count} owned ${ownedNoun} found`;
  const searchNoun = evidence.search_query_count === 1 ? 'search' : 'searches';
  const searchDetail = evidence.search_used
    ? `${evidence.search_query_count} ${searchNoun} recorded`
    : 'The provider did not report web search';
  const competitorDetail =
    evidence.competitors_mentioned.length > 0
      ? evidence.competitors_mentioned.join(', ')
      : 'No configured competitors appeared';

  return (
    <Stack as="section">
      <SubsectionHeader
        title="Why it scored this way"
        description="Deterministic checks against the persisted answer and source evidence."
      />
      <Stack className="desktop:grid-cols-2">
        <Outcome label="Brand detected" detail={brandDetail} passed={evidence.brand_mentioned} />
        <Outcome
          label="Owned source cited"
          detail={ownedDetail}
          passed={evidence.owned_domain_cited}
        />
        <Outcome label="Grounded with search" detail={searchDetail} passed={evidence.search_used} />
        <Outcome
          label="Competitor pressure"
          detail={competitorDetail}
          passed={evidence.competitors_mentioned.length === 0}
        />
      </Stack>
    </Stack>
  );
}

function CitationItem({
  citation,
}: Readonly<{ citation: ExecutionEvidence['citations'][number] }>) {
  const href = safeCitationUrl(citation.url);
  const ordinal = citation.ordinal > 0 ? citation.ordinal : citation.ordinal + 1;
  const title = citation.title || citation.domain || citation.url;

  // The answer's own numbering leads the title; the list order is the same.
  return (
    <LedgerItem
      title={
        <Inline as="span" className="items-baseline">
          <span className="type-body text-ink-2 tabular-nums">{ordinal}</span>
          <span className="min-w-0 truncate">
            {href ? (
              <TextLink variant="external" text="body" href={href}>
                {title}
              </TextLink>
            ) : (
              title || 'Untitled source'
            )}
          </span>
        </Inline>
      }
      meta={
        <StatusMark
          variant="classification"
          value={classificationBadgeValue(citation.classification)}
        >
          {classificationLabel(citation.classification)}
        </StatusMark>
      }
      caption={citation.domain}
    />
  );
}

function EvidenceCitationsList({
  citations,
}: Readonly<{ citations: ExecutionEvidence['citations'] }>) {
  return (
    <Stack as="section">
      <SubsectionHeader
        title="Citations"
        trailing={<span className="type-caption">{pluralCount(citations.length, 'source')}</span>}
      />
      {citations.length === 0 ? (
        <StateBlock
          kind="empty"
          headingLevel={3}
          icon={Quote}
          heading="No citations were captured from this response"
        />
      ) : (
        <LedgerList ordered label="Citations">
          {citations.map((citation) => (
            <CitationItem key={`${citation.ordinal}-${citation.url}`} citation={citation} />
          ))}
        </LedgerList>
      )}
    </Stack>
  );
}

function EvidenceFooter({ evidence }: Readonly<{ evidence: ExecutionEvidence }>) {
  return (
    <MetaFooter>
      <Inline as="span" gap="tight">
        <Icon icon={Search} />
        {evidence.prompt_class.replaceAll('_', ' ')} prompt
      </Inline>
      <span>Analyzer {evidence.analyzer_version}</span>
      <span>Rules {evidence.scoring_rule_version}</span>
    </MetaFooter>
  );
}

/** Clear, persisted explanation of one execution's deterministic evidence. */
export function EvidenceCard({
  evidence,
  answerText,
  isSearchSurface,
  outcome,
}: Readonly<{
  evidence: ExecutionEvidence;
  answerText?: string | null;
  isSearchSurface?: boolean;
  outcome?: string;
}>) {
  return (
    <Stack gap="workspace" className="min-w-0">
      <EvidenceMeasurement evidence={evidence} />
      <EvidenceMetrics evidence={evidence} />
      <EvidenceAnswer
        answerText={answerText}
        isSearchSurface={isSearchSurface}
        outcome={outcome}
        highlights={[
          ...perceptionHighlights(evidence.perception),
          ...claimHighlights(evidence.claims),
        ]}
      />
      <EvidencePerception perception={evidence.perception} />
      <EvidenceClaims claims={evidence.claims} />
      <EvidenceAds ads={evidence.ads} />
      {/* Only an observed surface has one, and its absence is not a state to
          render: an LLM execution has no overview to report on. */}
      {evidence.search_surface ? <SurfaceEvidence evidence={evidence.search_surface} /> : null}
      <EvidenceOutcomes evidence={evidence} />
      <EvidenceCitationsList citations={evidence.citations} />
      <EvidenceFooter evidence={evidence} />
    </Stack>
  );
}
