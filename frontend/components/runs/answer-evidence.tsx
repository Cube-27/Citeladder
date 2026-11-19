import { CheckCircle2, Search, XCircle } from 'lucide-react';

import { AnswerTranscript } from '@/components/runs/answer-transcript';
import { BrandsRail, FanoutRail, LinksRail, SourcesRail } from '@/components/runs/answer-rail';
import { AnswerFormatTags } from '@/components/runs/answer-formats';
import { EvidenceAds } from '@/components/runs/evidence-ads';
import { claimHighlights, EvidenceClaims } from '@/components/runs/evidence-claims';
import { EvidencePerception, perceptionHighlights } from '@/components/runs/evidence-perception';
import { MeasurementContext } from '@/components/runs/measurement-context';
import { SurfaceEvidence } from '@/components/runs/surface-evidence';
import { Absence } from '@/components/ui/absence';
import { AnswerLayout } from '@/components/ui/answer-chat';
import { BrandMark } from '@/components/ui/brand-mark';
import { FactList } from '@/components/ui/facts';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { wellClasses } from '@/components/ui/slip';
import { textRole } from '@/components/ui/typography';
import { MetaFooter, SubsectionHeader } from '@/components/ui/workspace';
import type { ExecutionEvidence } from '@citeladder/contracts';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useEngineCatalog } from '@/lib/providers/engines';
import { answerBrands, answerLinks, answerSources } from '@/lib/runs/answer-transcript';

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

/** The tracked business the answer named first (AV-7); untracked names never count. */
function namedFirst(first: ExecutionEvidence['first_named']) {
  switch (first.kind) {
    case 'brand':
    case 'competitor':
      return (
        <Inline gap="tight">
          <BrandMark
            name={first.name}
            logoUrl={first.logo_url}
            websiteUrl={first.website_url}
            placement="inline"
          />
          {first.name}
        </Inline>
      );
    case 'none':
      return <Absence state="none" label="No tracked brand" />;
    case 'unavailable':
      return <Absence state="unavailable" />;
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

/** The searches the answer ran; a surface that reports none is its own state, never "No". */
function searchesValue(evidence: ExecutionEvidence) {
  switch (evidence.search) {
    case 'used':
      return evidence.search_query_count;
    case 'not_used':
      return 'Not used';
    case 'not_reported':
      return <Absence state="unavailable" label="Not reported" />;
    default: {
      const unreachable: never = evidence.search;
      return unreachable;
    }
  }
}

function searchDetail(evidence: ExecutionEvidence): string {
  switch (evidence.search) {
    case 'used': {
      const noun = evidence.search_query_count === 1 ? 'search' : 'searches';
      return `${evidence.search_query_count} ${noun} recorded`;
    }
    case 'not_used':
      return 'The engine ran no web search';
    case 'not_reported':
      return 'Not reported: this engine does not say whether it searched the web';
    default: {
      const unreachable: never = evidence.search;
      return unreachable;
    }
  }
}

/** How the answer was measured, and what the analysis counted in it. */
function EvidenceMeasurement({ evidence }: Readonly<{ evidence: ExecutionEvidence }>) {
  const engines = useEngineCatalog();
  return (
    <Stack as="section">
      <SubsectionHeader title="Measurement" />
      <MeasurementContext
        retrieval={evidence.retrieval_enabled}
        model={engines.modelLabel(evidence.logical_engine, evidence.transport_model)}
      />
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
          { label: 'Searches', value: searchesValue(evidence) },
        ]}
      />
    </Stack>
  );
}

function brandOutcomeDetail(evidence: ExecutionEvidence): string {
  if (!evidence.brand_mentioned) return 'No tracked brand alias appeared in the answer';
  if (evidence.brand_first_offset === null) return 'Brand detected; match position unavailable';
  return `First match at character ${evidence.brand_first_offset}`;
}

function EvidenceOutcomes({ evidence }: Readonly<{ evidence: ExecutionEvidence }>) {
  const ownedNoun = evidence.owned_citation_count === 1 ? 'source' : 'sources';
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
        <Outcome
          label="Brand detected"
          detail={brandOutcomeDetail(evidence)}
          passed={evidence.brand_mentioned}
        />
        <Outcome
          label="Owned source cited"
          detail={`${evidence.owned_citation_count} owned ${ownedNoun} found`}
          passed={evidence.owned_domain_cited}
        />
        <Outcome
          label="Grounded with search"
          detail={searchDetail(evidence)}
          passed={evidence.search === 'used'}
        />
        <Outcome
          label="Competitor pressure"
          detail={competitorDetail}
          passed={evidence.competitors_mentioned.length === 0}
        />
      </Stack>
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

/**
 * The answer's text, or the sentence for its absence. An observed surface with
 * no text is two different things, and only the persisted OUTCOME separates
 * them: a measured absence is a finding, a missing capture a gap in ours.
 */
function transcriptBody(evidence: ExecutionEvidence) {
  const text = evidence.answer_text.trim();
  if (text) return { kind: 'markdown', text } as const;
  if (
    evidence.logical_engine === 'google_ai_overview' &&
    evidence.search_surface_outcome === 'no_ai_overview'
  )
    return { kind: 'note', text: 'No AI Overview was shown for this search.' } as const;
  return { kind: 'note', text: 'No answer text was captured for this execution.' } as const;
}

/**
 * One answer as a chat: the prompt and the engine's reply, then everything the
 * analysis found in it; the rail lists its brands, sources and searches.
 */
export function AnswerEvidence({
  evidence,
  promptText,
  promptId,
}: Readonly<{ evidence: ExecutionEvidence; promptText: string | null; promptId?: string }>) {
  const { project } = useProjectScope();
  const brands = answerBrands(evidence, project);
  const sources = answerSources(evidence.citations);
  return (
    <AnswerLayout
      railLabel="Brands, sources, links and searches"
      rail={
        <>
          <BrandsRail brands={brands} />
          <SourcesRail sources={sources} />
          <LinksRail
            links={answerLinks(evidence.answer_text, project)}
            formats={evidence.answer_formats}
          />
          <FanoutRail evidence={evidence} promptId={promptId} />
        </>
      }
      main={
        <>
          <AnswerTranscript
            promptText={promptText}
            engine={evidence.logical_engine}
            body={transcriptBody(evidence)}
            brands={brands}
            sources={sources}
            highlights={[
              ...perceptionHighlights(evidence.perception),
              ...claimHighlights(evidence.claims),
            ]}
          />
          <EvidencePerception perception={evidence.perception} />
          <EvidenceClaims claims={evidence.claims} />
          <EvidenceAds ads={evidence.ads} />
          {/* Only an observed surface has one; an LLM execution has no overview to report. */}
          {evidence.search_surface ? <SurfaceEvidence evidence={evidence.search_surface} /> : null}
          <EvidenceOutcomes evidence={evidence} />
          <EvidenceMeasurement evidence={evidence} />
          <EvidenceFooter evidence={evidence} />
        </>
      }
    />
  );
}
