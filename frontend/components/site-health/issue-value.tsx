import type { IssueValue } from '@citeladder/contracts';
import { Absence } from '@/components/ui/absence';
import { Text } from '@/components/ui/typography';
import { formatCount } from '@/lib/format';
import type { Evidence } from '@/lib/site-health/evidence-values';

const LABELS = {
  title: 'Title',
  meta_description: 'Meta description',
  h1_count: 'H1s',
  word_count: 'Words',
} as const;

const lengthRange = (evidence: Evidence) =>
  `recommended ${String(evidence.min_chars)}–${String(evidence.max_chars)}`;

const RANGE_BY_RULE: Readonly<Record<string, (evidence: Evidence) => string | null>> = {
  'technical.single_h1': () => null,
  'technical.title_length': lengthRange,
  'technical.meta_description_length': lengthRange,
  'aeo.thin_content': (evidence) => `recommended ${String(evidence.minimum_words)}+`,
};

export const showsPageText = (value: IssueValue | undefined) =>
  value?.kind === 'title' || value?.kind === 'meta_description';

export function valueRange(
  ruleId: string,
  evidence: Evidence,
  value: IssueValue,
): { hint: string | null } | null {
  const range = RANGE_BY_RULE[ruleId];
  if (range === undefined || value.kind === 'none' || value.kind === 'unavailable') return null;
  return { hint: range(evidence) };
}

export function IssueValueLine({
  value,
  hint = null,
}: Readonly<{ value: IssueValue; hint?: string | null }>) {
  if (value.kind === 'none') return null;
  switch (value.kind) {
    case 'unavailable':
      return (
        <Text as="p" variant="caption" box="shrink" wrap="anywhere">
          Value: <Absence state="unavailable" />
        </Text>
      );
    case 'title':
    case 'meta_description':
      return (
        <Text as="p" variant="caption" box="shrink" wrap="anywhere">
          {LABELS[value.kind]} ({formatCount(value.length)} chars{hint ? `, ${hint}` : ''}):{' '}
          {value.text ? <q>{value.text}</q> : <Absence state="none" />}
        </Text>
      );
    case 'h1_count':
    case 'word_count':
      return (
        <Text as="p" variant="caption" box="shrink" wrap="anywhere">
          {LABELS[value.kind]}:{' '}
          <Text variant="caption" numeric>
            {formatCount(value.count)}
          </Text>
          {hint ? ` (${hint})` : null}
        </Text>
      );
    default: {
      const unhandled: never = value;
      return unhandled;
    }
  }
}
