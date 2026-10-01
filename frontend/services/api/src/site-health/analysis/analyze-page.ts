/** One deterministic interpretation of immutable page facts: kind, traits, evaluations, scores. */
import { classify } from './page-kinds.ts';
import { record, text, type Facts } from './read-facts.ts';
import { evaluatePageRules } from './rules.ts';
import { scoreAnalysis } from './scoring.ts';
import { deriveTraits } from './traits.ts';

export type PageContext = {
  sitemapMember: boolean;
  /** Only the crawl root carries site-level facts (robots.txt, llms.txt). */
  siteFacts: Facts | null;
  auditTime: string | null;
};

export function analyzePage(facts: Facts, context: PageContext) {
  const finalUrl = text(record(facts.delivery).final_url);
  const assessment = classify(finalUrl, facts);
  const traits = deriveTraits(finalUrl, facts);
  const evaluationFacts: Facts = {
    ...facts,
    page_kind: assessment.page_kind,
    page_kind_evidence: assessment.evidence,
    page_traits: traits,
    sitemap_member: context.sitemapMember,
    ...(context.siteFacts ? { site: context.siteFacts } : {}),
    ...(context.auditTime ? { audit_time: context.auditTime } : {}),
  };
  const evaluations = evaluatePageRules(evaluationFacts);
  return {
    assessment,
    traits,
    evaluations,
    scores: scoreAnalysis(evaluations, assessment.page_kind),
  };
}
