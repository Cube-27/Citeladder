import { Check, Minus, X } from 'lucide-react';

import { LogoMark } from '@/components/ui/logo-mark';
import { cn } from '@/lib/utils';

type Verdict = 'yes' | 'partial' | 'no';

const VERDICTS = {
  yes: { word: 'Yes', Icon: Check },
  partial: { word: 'Partial', Icon: Minus },
  no: { word: 'No', Icon: X },
} as const satisfies Record<Verdict, unknown>;

function VerdictCell({ verdict }: Readonly<{ verdict: Verdict }>) {
  const { word, Icon } = VERDICTS[verdict];
  return (
    <span className={cn('cl-verdict', `cl-verdict--${verdict}`)}>
      <Icon aria-hidden className="size-4" />
      {word}
    </span>
  );
}

export type CompareRow = Readonly<{
  feature: string;
  us: Verdict;
  them: Verdict;
  note?: string;
}>;

/**
 * CompareTable: CiteLadder beside one competitor, a word and a mark per cell
 * (never colour alone), with a notes column. Scrolls in its frame on phones
 * with the capability column pinned.
 */
export function CompareTable({
  competitor,
  groups,
  featureLabel = 'Capability',
  caption = `CiteLadder compared with ${competitor}`,
}: Readonly<{
  competitor: string;
  groups: readonly Readonly<{ title?: string; rows: readonly CompareRow[] }>[];
  featureLabel?: string;
  caption?: string;
}>) {
  return (
    <section
      className="cl-wtable focus-ring"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0} // NOSONAR -- WCAG 2.1.1: a region that scrolls sideways must take focus so the keyboard can scroll it
      aria-label={caption}
    >
      <table>
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="cl-ctable-feature" />
          <col className="cl-ctable-v" />
          <col className="cl-ctable-v" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{featureLabel}</th>
            <th scope="col">
              <span className="cl-ctable-brand">
                <LogoMark size={16} wordmark={false} />
                CiteLadder
              </span>
            </th>
            <th scope="col">{competitor}</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        {groups.map((group, groupIndex) => (
          <tbody key={group.title ?? groupIndex}>
            {group.title && (
              <tr className="cl-wt-group">
                <th scope="colgroup" colSpan={4}>
                  {group.title}
                </th>
              </tr>
            )}
            {group.rows.map((row) => (
              <tr key={row.feature}>
                <th scope="row">{row.feature}</th>
                <td>
                  <VerdictCell verdict={row.us} />
                </td>
                <td>
                  <VerdictCell verdict={row.them} />
                </td>
                <td className="cl-ctable-note">{row.note}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}
