/**
 * Win rate (AV-7): which tracked business an answer names first, and how often
 * each one is. Only the tracked roster competes, so an untracked name earlier
 * in the answer never wins, and an answer naming no tracked business is not
 * applicable rather than a loss.
 */
import { firstNamedSchema, type FirstNamed } from '@citeladder/contracts/audits';
import type { WinCounts } from '@citeladder/contracts/visibility';
import { z } from 'zod';

import { compareText } from '../text-order.ts';

export type AnswerFirstNamed = Exclude<FirstNamed, { kind: 'unavailable' }>;

/** The tracked business named first; the brand wins an offset tie, as `brandPosition` ranks it. */
export function firstNamed(input: {
  brandName: string;
  brandOffset: number | null;
  competitorOffsets: Readonly<Record<string, number>>;
}): AnswerFirstNamed {
  let first: AnswerFirstNamed =
    input.brandOffset === null ? { kind: 'none' } : { kind: 'brand', name: input.brandName };
  let at = input.brandOffset;
  const competitors = Object.entries(input.competitorOffsets).sort(([a], [b]) => compareText(a, b));
  for (const [name, offset] of competitors) {
    if (at === null || offset < at) {
      first = { kind: 'competitor', name };
      at = offset;
    }
  }
  return first;
}

export function firstNamedColumns(first: AnswerFirstNamed) {
  return {
    first_named_kind: first.kind,
    first_named_name: first.kind === 'none' ? null : first.name,
  };
}

type StoredFirstNamed = { first_named_kind: string | null; first_named_name: string | null };

/** The stored derivation; a row analysed before it existed is unavailable. */
export function storedFirstNamed(row: StoredFirstNamed): FirstNamed {
  if (row.first_named_kind === null) return { kind: 'unavailable' };
  return firstNamedSchema.parse({
    kind: row.first_named_kind,
    ...(row.first_named_name === null ? {} : { name: row.first_named_name }),
  });
}

const winTallySchema = z.object({
  answers: z.number().int(),
  first: z.record(z.string(), z.number().int()),
});
/** Answers naming a tracked business, and how many of them each business was named first in. */
export type WinTally = z.infer<typeof winTallySchema>;

/** The tally over a set of answers, keyed like share of voice; null when any is unavailable. */
export function winTally(answers: readonly FirstNamed[], brandKey: string): WinTally | null {
  const first: Record<string, number> = {};
  let counted = 0;
  for (const named of answers) {
    let key: string;
    switch (named.kind) {
      case 'unavailable':
        return null;
      case 'none':
        continue;
      case 'brand':
        key = brandKey;
        break;
      case 'competitor':
        key = named.name;
        break;
      default: {
        const unreachable: never = named;
        throw new Error(`unknown first-named kind: ${JSON.stringify(unreachable)}`);
      }
    }
    first[key] = (first[key] ?? 0) + 1;
    counted++;
  }
  return { answers: counted, first };
}

/** A tally a metric snapshot persisted, or null when it predates the derivation; corrupt fails. */
export function storedWinTally(value: unknown): WinTally | null {
  return value === null || value === undefined ? null : winTallySchema.parse(value);
}

/** The brand's win counts over stored answers. */
export function brandWinCounts(rows: readonly StoredFirstNamed[]): WinCounts {
  const named = rows.map(storedFirstNamed);
  if (named.some((answer) => answer.kind === 'unavailable')) return winCounts(null, '');
  const answers = named.filter((answer) => answer.kind !== 'none').length;
  const count = named.filter((answer) => answer.kind === 'brand').length;
  return { win_count: count, win_answers: answers, win_rate: answers ? count / answers : null };
}

/** Summed counts; one unavailable part, or none at all, is unavailable. */
export function sumWinCounts(parts: readonly WinCounts[]): WinCounts {
  let count = 0;
  let answers = 0;
  for (const part of parts) {
    if (part.win_count === null || part.win_answers === null) return winCounts(null, '');
    count += part.win_count;
    answers += part.win_answers;
  }
  if (parts.length === 0) return winCounts(null, '');
  return { win_count: count, win_answers: answers, win_rate: answers ? count / answers : null };
}

export function winCounts(tally: WinTally | null, name: string): WinCounts {
  if (tally === null) return { win_count: null, win_answers: null, win_rate: null };
  const count = tally.first[name] ?? 0;
  return {
    win_count: count,
    win_answers: tally.answers,
    win_rate: tally.answers ? count / tally.answers : null,
  };
}
