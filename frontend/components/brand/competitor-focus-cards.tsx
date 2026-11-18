import type { CompetitorFocus } from '@citeladder/contracts/visibility-competitor';

import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { formatCount } from '@/lib/format';
import { promptHistoryHref } from '@/lib/prompts/history';

/** "10 of 32" when the read capped the list, else nothing. */
function cappedCount(shown: number, total: number): string | undefined {
  return total > shown ? `${formatCount(shown)} of ${formatCount(total)}` : undefined;
}

const SOURCE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'domain', label: 'Domain' },
  { key: 'answers', label: 'Answers', kind: 'number', width: 'figure' },
  { key: 'you', label: 'You', width: 'category' },
];

/** Domains cited in answers naming the competitor, and whether they appear beside you too. */
export function CompetitorSources({ focus }: Readonly<{ focus: CompetitorFocus }>) {
  const name = focus.competitor.name;
  return (
    <DataTable
      title={`Sources when ${name} is named`}
      description={cappedCount(focus.sources.length, focus.sources_total)}
      label={`Sources when ${name} is named`}
      columns={SOURCE_COLUMNS}
      footer="“You’re cited too”: the domain is also cited in answers that name you."
      state={
        focus.sources.length
          ? undefined
          : {
              kind: 'empty',
              inline: true,
              message: focus.answers
                ? `No sources cited in answers naming ${name}.`
                : `No answer named ${name} in this selection.`,
            }
      }
    >
      {focus.sources.map((source) => (
        <TableRow key={source.domain}>
          <TableCell>
            <ClampText lines={1}>{source.domain}</ClampText>
          </TableCell>
          <TableCell numeric>{source.answers}</TableCell>
          <TableCell>
            {source.answers_naming_you > 0 ? (
              <Tag>You’re cited too</Tag>
            ) : (
              <StatusMark variant="status" value="warning">
                Not citing you
              </StatusMark>
            )}
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const PROMPT_COLUMNS: readonly DataTableColumn[] = [
  { key: 'prompt', label: 'Prompt' },
  { key: 'topic', label: 'Topic', width: 'name' },
  { key: 'engines', label: 'Engines', kind: 'number', width: 'figure' },
];

/** Prompts where an answer names the competitor and not you; rows open the prompt. */
export function NamedInsteadOfYou({ focus }: Readonly<{ focus: CompetitorFocus }>) {
  return (
    <DataTable
      title="Named instead of you"
      description={[
        cappedCount(focus.named_instead.length, focus.named_instead_total),
        'Rows open the prompt',
      ]
        .filter(Boolean)
        .join(' · ')}
      label="Named instead of you"
      columns={PROMPT_COLUMNS}
      state={
        focus.named_instead.length
          ? undefined
          : {
              kind: 'empty',
              inline: true,
              message: `No answer named ${focus.competitor.name} without you.`,
            }
      }
    >
      {focus.named_instead.map((row) => (
        <TableRow key={row.prompt_id ?? row.prompt}>
          <TableCell>
            <ClampText lines={1}>
              {row.prompt_id ? (
                <TextLink href={promptHistoryHref(row.prompt_id)} text="inherit" underline="hover">
                  {row.prompt}
                </TextLink>
              ) : (
                row.prompt
              )}
            </ClampText>
          </TableCell>
          <TableCell>
            <ClampText lines={1} className={textRole('body', 'text-ink-2')}>
              {row.topic}
            </ClampText>
          </TableCell>
          <TableCell numeric>
            {row.engines} of {row.engines_answered}
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
