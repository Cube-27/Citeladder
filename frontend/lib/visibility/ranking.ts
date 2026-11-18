import type { RankingRow, WinCounts } from '@citeladder/contracts';
import { formatRank } from '@/lib/visibility/dashboard';

/** Where one roster competitor's page lives: keyed by its roster name. */
export function competitorHref(name: string): `/${string}` {
  return `/competitors/${encodeURIComponent(name)}`;
}

/**
 * Why a win rate is missing (AV-7): no answer naming a tracked brand is not
 * applicable; a run finalized without first-named data is not measured.
 */
export function winRateAbsence(
  row: Pick<WinCounts, 'win_answers'> | undefined,
): 'not_applicable' | 'not_measured' {
  return row?.win_answers === 0 ? 'not_applicable' : 'not_measured';
}

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

/** Where the tracked brand stands among the brands it is measured beside. */
export type BrandStanding =
  | { kind: 'unmeasured' }
  /** No competitors are tracked. */
  | { kind: 'alone' }
  /** Competitors are tracked, but none has a measured visibility here. */
  | { kind: 'competitors_unmeasured' }
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

/**
 * The Insights headline's facts, from the same ranking the Competitors table
 * draws. Ties share a rank (1, 2, 2, 4): equal visibility is equal standing.
 */
export function brandStanding(rows: readonly RankingRow[]): BrandStanding {
  const ordered = orderByVisibility(rows);
  const rate = ordered.find((row) => row.is_brand)?.mention_rate;
  if (rate == null) return { kind: 'unmeasured' };
  const competitors = ordered.filter((row) => !row.is_brand);
  if (!competitors.length) return { kind: 'alone' };
  const measured = competitors.filter((row) => row.mention_rate != null);
  if (!measured.length) return { kind: 'competitors_unmeasured' };
  const above = measured.filter((row) => (row.mention_rate ?? 0) > rate);
  return {
    kind: 'ranked',
    rank: above.length + 1,
    ahead: above.at(-1)?.name ?? null,
    behind: measured.find((row) => (row.mention_rate ?? 0) < rate)?.name ?? null,
    tied: measured.filter((row) => row.mention_rate === rate).map((row) => row.name),
  };
}

/** "A", "A and B", "A, B and C". */
function nameList(names: readonly string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

type Ranked = Extract<BrandStanding, { kind: 'ranked' }>;

/** The brand just ahead; at the top, the brand just behind. */
function neighbourLine({ ahead, behind }: Ranked): string | null {
  if (ahead) return `${ahead} is named more often.`;
  if (behind) return `You're named more often than ${behind}.`;
  return null;
}

function tieLine(tied: Ranked['tied']): string | null {
  if (!tied.length) return null;
  return `${nameList(tied)} ${tied.length > 1 ? 'are' : 'is'} named as often as you.`;
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
        headline: "You aren't tracking any competitors yet",
        sub: 'Add competitors in Context to see where you rank.',
      };
    case 'competitors_unmeasured':
      return {
        headline: "Your competitors' visibility is not measured in this selection",
        sub: null,
      };
    case 'ranked': {
      const sub = [neighbourLine(standing), tieLine(standing.tied)].filter(Boolean).join(' ');
      return {
        headline: `You're ${formatRank(standing.rank)} in AI visibility`,
        sub: sub || null,
      };
    }
    default: {
      const unreachable: never = standing;
      return unreachable;
    }
  }
}
