import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { FirstNamed, PromptAnswer, PromptAnswerPage } from '@citeladder/contracts';
import type { ProjectMarket } from '@citeladder/contracts/markets';
import { AnswerFormatTags } from '@/components/runs/answer-formats';
import { useAnswerDialog } from '@/components/runs/answer-link';
import { Absence } from '@/components/ui/absence';
import { BrandMark } from '@/components/ui/brand-mark';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Inline } from '@/components/ui/layout';
import { queryTableState, type TableRead } from '@/components/ui/state-block';
import { Pressable } from '@/components/ui/pressable';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { Tooltip } from '@/components/ui/tooltip';
import { Text } from '@/components/ui/typography';
import { runsQueries, type PromptAnswerParams } from '@/lib/api/runs';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useEngineCatalog } from '@/lib/providers/engines';

const PAGE_SIZE = 25;

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'run', label: 'Run', kind: 'date', order: 'descending' },
  { key: 'engine', label: 'Engine', width: 'category' },
  { key: 'market', label: 'Market', width: 'index' },
  { key: 'brands', label: 'Brands named', kind: 'identity' },
  {
    key: 'you',
    label: 'You',
    kind: 'number',
    hint: 'Your place among the brands you track in this answer; brands you do not track are not counted.',
  },
  { key: 'cited', label: 'Cited', width: 'figure' },
  { key: 'search', label: 'Search used', width: 'figure', priority: 'low' },
  { key: 'formats', label: 'Answer formats', width: 'name', priority: 'low' },
];

export function PromptPastAnswers({
  promptId,
  promptText,
  params,
  markets,
}: Readonly<{
  promptId: string;
  promptText: string;
  params: PromptAnswerParams;
  markets: readonly ProjectMarket[];
}>) {
  const scope = useProjectScope();
  const engines = useEngineCatalog();
  const timeZone = useDisplayTimeZone();
  const [cursors, setCursors] = useState<readonly string[]>([]);
  const answerDialog = useAnswerDialog();
  const openAnswer = (id: string) =>
    answerDialog.open({ id, prompt_text: promptText, prompt_id: promptId });
  const read = useQuery({
    ...runsQueries.promptExecutions(scope, promptId, {
      ...params,
      cursor: cursors.at(-1),
      limit: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });
  const page = read.data;
  const marketCode =
    markets.find((option) => option.id === (page?.market_id ?? null))?.country_code ?? null;
  const from = cursors.length * PAGE_SIZE + 1;
  return (
    <>
      <DataTable
        title="Past answers"
        columns={COLUMNS}
        pageSize={PAGE_SIZE}
        {...tableState(read)}
        busy={{ active: read.isPlaceholderData, label: 'Loading answers…' }}
        pager={
          page?.items.length
            ? {
                range: { from, to: from + page.items.length - 1, noun: 'answers' },
                canPrev: cursors.length > 0,
                canNext: page.next_cursor !== null,
                onPrev: () => setCursors((stack) => stack.slice(0, -1)),
                onNext: () => {
                  const next = page.next_cursor;
                  if (next) setCursors((stack) => [...stack, next]);
                },
                busy: read.isPlaceholderData,
              }
            : undefined
        }
      >
        {page?.items.map((answer) => (
          <TableRow key={answer.execution_id} onOpen={() => openAnswer(answer.execution_id)}>
            <TableCell>
              <TextLink asChild underline="hover">
                <Pressable
                  aria-haspopup="dialog"
                  aria-label={`Open the ${engines.label(answer.logical_engine)} answer from ${formatDisplayDate(answer.run_at, timeZone)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openAnswer(answer.execution_id);
                  }}
                  box="target-shrink"
                >
                  {formatDisplayDate(answer.run_at, timeZone)}
                </Pressable>
              </TextLink>
            </TableCell>
            <TableCell>{engines.label(answer.logical_engine)}</TableCell>
            <TableCell>{marketCode ?? <Absence state="unavailable" />}</TableCell>
            <TableCell>
              <BrandsNamed brands={answer.brands} first={answer.first_named} />
            </TableCell>
            <TableCell numeric>
              <YourPlace answer={answer} />
            </TableCell>
            <TableCell>
              {answer.cited ? (
                <StatusMark tone="positive">Cited</StatusMark>
              ) : (
                <Absence state="none" label="Not cited" />
              )}
            </TableCell>
            <TableCell>
              <SearchUsed search={answer.search} />
            </TableCell>
            <TableCell>
              <AnswerFormatTags formats={answer.answer_formats} />
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      {answerDialog.dialog}
    </>
  );
}

function tableState(read: TableRead<PromptAnswerPage>) {
  return queryTableState(read, {
    subject: 'past answers',
    empty: (page) =>
      page.items.length
        ? undefined
        : { kind: 'empty', headingLevel: 3, icon: ICONS.runs, heading: 'No answers to show' },
  });
}

type Brand = PromptAnswer['brands'][number];

function firstOf(brands: readonly Brand[], first: FirstNamed): Brand | undefined {
  if (first.kind !== 'brand' && first.kind !== 'competitor') return undefined;
  const key = first.name.trim().toLowerCase();
  return brands.find(
    (brand) => brand.kind === first.kind && brand.name.trim().toLowerCase() === key,
  );
}

export function BrandsNamed({
  brands,
  first,
}: Readonly<{ brands: readonly Brand[]; first?: FirstNamed }>) {
  if (!brands.length) return <Absence state="none" label="No tracked brand" />;
  const lead = first ? firstOf(brands, first) : undefined;
  return (
    <Inline as="span" gap="tight">
      {brands.map((brand) => (
        <Tooltip key={`${brand.kind}:${brand.name}`} content={brand.name}>
          <span className="inline-flex min-w-0">
            <Inline as="span" gap="tight">
              {brand === lead ? null : <span className="sr-only">{brand.name}</span>}
              <BrandMark
                name={brand.name}
                logoUrl={brand.logo_url}
                websiteUrl={brand.website}
                placement="inline"
              />
              {brand === lead ? (
                <Text as="strong" variant="label" wrap="truncate">
                  {brand.name}
                  <span className="sr-only">, named first</span>
                </Text>
              ) : null}
            </Inline>
          </span>
        </Tooltip>
      ))}
    </Inline>
  );
}

function YourPlace({ answer }: Readonly<{ answer: PromptAnswer }>) {
  if (!answer.brand_mentioned) return <Absence state="none" label="Not named" />;
  if (answer.position === null)
    return (
      <Absence state="unavailable" reason="This answer named you; its order was not recorded." />
    );
  return `#${answer.position}`;
}

function SearchUsed({ search }: Readonly<{ search: PromptAnswer['search'] }>) {
  switch (search) {
    case 'used':
      return 'Yes';
    case 'not_used':
      return 'No';
    case 'not_reported':
      return <Absence state="unavailable" label="Not reported" />;
    default: {
      const unreachable: never = search;
      return unreachable;
    }
  }
}
