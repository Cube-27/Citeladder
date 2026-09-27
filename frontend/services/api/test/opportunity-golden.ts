import { pageGroupKey } from '../src/analysis/opportunities/actions.ts';
import { linksToOwned, listedInHeadings } from '../src/analysis/opportunities/page-predicates.ts';
import { evaluatePlacement } from '../src/analysis/opportunities/placement-outcome.ts';
import {
  classifySourceDomain,
  summarizeSourcePattern,
} from '../src/analysis/opportunities/source-patterns.ts';
const ports: Record<string, (...args: never[]) => unknown> = {
  source_pattern: summarizeSourcePattern,
  source_class: classifySourceDomain,
  placement: evaluatePlacement,
  headings: listedInHeadings,
  links: linksToOwned,
  page_key: pageGroupKey,
};
export function opportunityGolden(input: { op: string; args: never[] }): unknown {
  const port = ports[input.op];
  if (!port) throw new Error(`Missing opportunity golden port: ${input.op}`);
  return port(...input.args);
}
