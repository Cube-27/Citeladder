import type { RankingRow } from '@citeladder/contracts';
import { formatPosition } from '@/lib/visibility/dashboard';

/** Stable identity for one ranking row, matching the table's React key. */
export function rankingRowKey(row: Pick<RankingRow, 'is_brand' | 'name'>): string {
  return `${row.is_brand}-${row.name}`;
}

/** Highest visibility first, unmeasured last, then name, so ties are stable. */
export function orderByVisibility(rows: readonly RankingRow[]): RankingRow[] {
  return [...rows].sort(
    (a, b) => (b.mention_rate ?? -1) - (a.mention_rate ?? -1) || a.name.localeCompare(b.name),
  );
}

/**
 * Competitive rank, 1…N, over `orderByVisibility`'s order.
 *
 * Ties share a rank (1, 2, 2, 4): equal visibility is equal standing. A brand
 * with no measured visibility has no standing and is left unranked (null)
 * rather than pushed to last place.
 */
export function competitiveRanks(ordered: readonly RankingRow[]): Map<string, number | null> {
  const ranks = new Map<string, number | null>();
  let previousRate: number | null = null;
  let previousRank = 0;
  ordered.forEach((row, index) => {
    if (row.mention_rate == null) {
      ranks.set(rankingRowKey(row), null);
      return;
    }
    if (previousRate !== null && row.mention_rate === previousRate) {
      ranks.set(rankingRowKey(row), previousRank);
      return;
    }
    previousRank = index + 1;
    previousRate = row.mention_rate;
    ranks.set(rankingRowKey(row), previousRank);
  });
  return ranks;
}

/** Where the tracked brand stands among the brands it is measured beside. */
export type BrandStanding =
  | { kind: 'unmeasured' }
  | { kind: 'alone' }
  | {
      kind: 'ranked';
      rank: number;
      /** The nearest brand named more often, or null at the top. */
      ahead: string | null;
      /** The nearest brand named less often, or null at the bottom. */
      behind: string | null;
      /** Brands named exactly as often as the tracked brand. */
      tied: readonly string[];
    };

/** The Insights headline's facts, from the same ranking the Competitors table draws. */
export function brandStanding(rows: readonly RankingRow[]): BrandStanding {
  const ordered = orderByVisibility(rows);
  const brand = ordered.find((row) => row.is_brand);
  if (!brand || brand.mention_rate == null) return { kind: 'unmeasured' };
  const rate = brand.mention_rate;
  const others = ordered.filter((row) => !row.is_brand && row.mention_rate != null);
  if (!others.length) return { kind: 'alone' };
  const rank = competitiveRanks(ordered).get(rankingRowKey(brand)) ?? 1;
  const ahead = others.filter((row) => (row.mention_rate ?? 0) > rate).at(-1)?.name ?? null;
  const behind = others.find((row) => (row.mention_rate ?? 0) < rate)?.name ?? null;
  const tied = others.filter((row) => row.mention_rate === rate).map((row) => row.name);
  return { kind: 'ranked', rank, ahead, behind, tied };
}

/** "A", "A and B", "A, B and C". */
function nameList(names: readonly string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The Insights lede's headline and the sentence under it. */
export function standingHeadline(standing: BrandStanding): {
  headline: string;
  sub: string | null;
} {
  switch (standing.kind) {
    case 'unmeasured':
      return { headline: 'Your AI visibility is not measured in this selection', sub: null };
    case 'alone':
      return {
        headline: "You're the only tracked brand measured",
        sub: 'Add competitors in Context to see where you rank.',
      };
    case 'ranked': {
      const { rank, ahead, behind, tied } = standing;
      const lead = ahead
        ? `${ahead} is named more often.`
        : behind
          ? `You're named more often than ${behind}.`
          : null;
      const tie = tied.length
        ? `${nameList(tied)} ${tied.length > 1 ? 'are' : 'is'} named as often as you.`
        : null;
      const sub = [lead, tie].filter(Boolean).join(' ');
      return { headline: `You're ${formatPosition(rank)} in AI visibility`, sub: sub || null };
    }
    default: {
      const unreachable: never = standing;
      return unreachable;
    }
  }
}
