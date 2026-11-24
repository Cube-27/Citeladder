import type { CrawlBudgets } from '@citeladder/contracts';

export type CrawlBudget = CrawlBudgets['full_crawls'];

export function budgetLeft(budget: CrawlBudget, noun: string): string {
  return `${budget.remaining} of ${budget.limit} ${noun} left this period`;
}

export function budgetUsedUp(budget: CrawlBudget | undefined, noun: string): string | null {
  if (!budget || budget.remaining > 0) return null;
  return `All ${budget.limit} ${noun} for this period are used. More from ${budget.resets_at.slice(0, 10)}.`;
}
