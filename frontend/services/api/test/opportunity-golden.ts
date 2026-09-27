import { groupMembers, pageGroupKey, targetFor } from '../src/analysis/opportunities/actions.ts';
import {
  detectBrandAbsentHighValuePrompt,
  detectOwnedPageNotCited,
  detectSiteIssueOpportunities,
} from '../src/analysis/opportunities/detectors.ts';
import {
  detectEarnedPageOpportunities,
  qualification,
} from '../src/analysis/opportunities/earned-pages.ts';
import { rowsToCsv, rowsToMarkdown } from '../src/analysis/opportunities/exports.ts';
import { linksToOwned, listedInHeadings } from '../src/analysis/opportunities/page-predicates.ts';
import { evaluatePlacement } from '../src/analysis/opportunities/placement-outcome.ts';
import {
  gapFactorVisibility,
  pageCompetitorPresenceFactor,
  pageRecurrenceFactor,
  priorityScore,
  recommendationStrengthFactor,
  valueFactorForIntent,
  valueFactorForPrompt,
} from '../src/analysis/opportunities/scoring.ts';
import { buildSourceProjection } from '../src/analysis/opportunities/source-mix.ts';
import {
  classifySourceDomain,
  summarizeSourcePattern,
} from '../src/analysis/opportunities/source-patterns.ts';
const ports: Record<string, (...args: never[]) => unknown> = {
  intent: valueFactorForIntent,
  prompt_value: valueFactorForPrompt,
  gap: gapFactorVisibility,
  competitor_factor: pageCompetitorPresenceFactor,
  recurrence: pageRecurrenceFactor,
  priority: priorityScore,
  recommendation: recommendationStrengthFactor,
  source_pattern: summarizeSourcePattern,
  source_class: classifySourceDomain,
  brand_absent: detectBrandAbsentHighValuePrompt,
  owned_not_cited: detectOwnedPageNotCited,
  site: detectSiteIssueOpportunities,
  source_mix: buildSourceProjection,
  qualification,
  earned: detectEarnedPageOpportunities,
  placement: evaluatePlacement,
  headings: listedInHeadings,
  links: linksToOwned,
  csv: rowsToCsv,
  markdown: rowsToMarkdown,
  groups: groupMembers,
  target: targetFor,
  page_key: pageGroupKey,
};
export function opportunityGolden(input: { op: string; args: never[] }): unknown {
  const port = ports[input.op];
  if (!port) throw new Error(`Missing opportunity golden port: ${input.op}`);
  return port(...input.args);
}
