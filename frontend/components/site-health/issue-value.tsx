import type { IssueValue } from '@citeladder/contracts';
import { Absence } from '@/components/ui/absence';
import { textRole } from '@/components/ui/typography';
import { formatCount } from '@/lib/format';

const LABELS = {
  title: 'Title',
  meta_description: 'Meta description',
  h1_count: 'H1s',
  word_count: 'Words',
} as const;

export const showsPageText = (value: IssueValue | undefined) =>
  value?.kind === 'title' || value?.kind === 'meta_description';

export function IssueValueLine({ value }: Readonly<{ value: IssueValue | undefined }>) {
  if (value === undefined || value.kind === 'none') return null;
  const line = textRole('caption', 'min-w-0 [overflow-wrap:anywhere]');
  switch (value.kind) {
    case 'unavailable':
      return (
        <p className={line}>
          Value: <Absence state="unavailable" />
        </p>
      );
    case 'title':
    case 'meta_description':
      return (
        <p className={line}>
          {LABELS[value.kind]} ({formatCount(value.length)} chars):{' '}
          {value.text ? <q>{value.text}</q> : <Absence state="none" />}
        </p>
      );
    case 'h1_count':
    case 'word_count':
      return (
        <p className={line}>
          {LABELS[value.kind]}: <span className="tabular-nums">{formatCount(value.count)}</span>
        </p>
      );
    default: {
      const unhandled: never = value;
      return unhandled;
    }
  }
}
