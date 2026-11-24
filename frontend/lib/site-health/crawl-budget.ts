import { useQuery } from '@tanstack/react-query';
import type { CrawlBudgets } from '@citeladder/contracts';

import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { siteHealthQueries } from '@/lib/api/site-health-queries';

export type CrawlBudget = CrawlBudgets['full_crawls'];
type CrawlBudgetKind = keyof CrawlBudgets;

const NOUNS = {
  full_crawls: 'full crawls',
  page_crawls: 'single-page crawls',
} as const satisfies Record<CrawlBudgetKind, string>;

export function budgetLeft(budget: CrawlBudget, noun: string): string {
  return `${budget.remaining} of ${budget.limit} ${noun} left this period`;
}

function budgetUsedUp(budget: CrawlBudget | undefined, noun: string): string | null {
  if (!budget || budget.remaining > 0) return null;
  return `All ${budget.limit} ${noun} for this period are used. More from ${budget.resets_at.slice(0, 10)}.`;
}

export function useCrawlBudget(scope: ProjectScope, kind: CrawlBudgetKind, enabled: boolean) {
  const query = useQuery({ ...siteHealthQueries.crawlBudgets(scope), enabled });
  const budget = query.data?.[kind];
  return {
    budget,
    usedUp: budgetUsedUp(budget, NOUNS[kind]),
    left: budget ? budgetLeft(budget, NOUNS[kind]) : null,
  };
}
