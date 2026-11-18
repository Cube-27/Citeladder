import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { FirstNamed, PromptAnswer, PromptAnswerPage } from '@citeladder/contracts';
import type { ProjectMarket } from '@citeladder/contracts/markets';
import { AnswerFormatTags } from '@/components/runs/answer-formats';
import { ExecutionEvidenceDrawer } from '@/components/runs/execution-evidence-drawer';
import { Absence } from '@/components/ui/absence';
import { BrandMark } from '@/components/ui/brand-mark';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { DataTableState } from '@/components/ui/data-table-body';
import { Inline } from '@/components/ui/layout';
import { readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { Pressable } from '@/components/ui/pressable';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
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
  { key: 'you', label: 'You', kind: 'number' },
  { key: 'cited', label: 'Cited', width: 'short' },
  { key: 'search', label: 'Search used', width: 'figure', priority: 'low' },
  { key: 'formats', label: 'Answer formats', width: 'name', priority: 'low' },
];

/**
 * Every answer this prompt got, newest run first, 25 a page. Pages are keyset:
 * Older follows the server's cursor and Newer pops back to the page before, so
 * a run landing meanwhile never shifts what the reader is on. The parent keys
 * this by its filters, so a filter change starts again at the newest answer.
 * Each row opens the answer's evidence.
 */
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
  // The cursors of the pages before this one; the first page has none.
  const [cursors, setCursors] = useState<readonly string[]>([]);
  const [opened, setOpened] = useState<string | null>(null);
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
        description={`Every answer this prompt got, newest first${namesFirst(page) ? ' · bold brand was named first' : ''}`}
        columns={COLUMNS}
        pageSize={PAGE_SIZE}
        rowCount={page?.items.length}
        state={tableState(read, page)}
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
          <TableRow
            key={answer.execution_id}
            className="cursor-pointer"
            onClick={() => setOpened(answer.execution_id)}
          >
            <TableCell>
              {/* The whole row opens the answer; the date is the keyboard's way in. */}
              <TextLink asChild underline="hover">
                <Pressable
                  aria-haspopup="dialog"
                  aria-label={`Open the ${engines.label(answer.logical_engine)} answer from ${formatDisplayDate(answer.run_at, timeZone)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpened(answer.execution_id);
                  }}
                  className="min-h-6 w-auto min-w-0"
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
      <ExecutionEvidenceDrawer
        execution={opened ? { id: opened, prompt_text: promptText } : null}
        open={opened !== null}
        onOpenChange={(next) => {
          if (!next) setOpened(null);
        }}
      />
    </>
  );
}

function tableState(
  read: RetryableRead & Readonly<{ isError: boolean }>,
  page: PromptAnswerPage | undefined,
): DataTableState | undefined {
  if (read.isError && !page)
    return {
      kind: 'error',
      ...readErrorProps(read),
      title: "Couldn't load past answers",
      fallback: 'Check your connection and try again.',
    };
  if (!page) return { kind: 'loading', label: 'Loading past answers…' };
  if (!page.items.length)
    return {
      kind: 'empty',
      headingLevel: 3,
      icon: ICONS.runs,
      heading: 'No answers to show',
      description:
        'No finished run has a successful answer to this prompt that matches the filters.',
    };
  return undefined;
}

type Brand = PromptAnswer['brands'][number];

/** The page names a first brand somewhere: only then does the bold mean something. */
function namesFirst(page: PromptAnswerPage | undefined): boolean {
  return Boolean(page?.items.some((answer) => firstOf(answer.brands, answer.first_named)));
}

/** The shown brand the stored value says was named first; none when unavailable or none. */
function firstOf(brands: readonly Brand[], first: FirstNamed): Brand | undefined {
  if (first.kind !== 'brand' && first.kind !== 'competitor') return undefined;
  const key = first.name.trim().toLowerCase();
  return brands.find(
    (brand) => brand.kind === first.kind && brand.name.trim().toLowerCase() === key,
  );
}

/**
 * Tracked brands as their marks, in the given order; none is "No tracked brand".
 * The brand stored as named first also shows its name, bold.
 */
export function BrandsNamed({
  brands,
  first,
}: Readonly<{ brands: readonly Brand[]; first?: FirstNamed }>) {
  // Measured, and no tracked brand was named: a finding, never "not measured".
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
                <strong className={textRole('emphasis', 'text-ink truncate')}>
                  {brand.name}
                  <span className="sr-only">, named first</span>
                </strong>
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
      // The engine exposes no search signal: its own state, never "No".
      return <Absence state="unavailable" label="Not reported" />;
    default: {
      const unreachable: never = search;
      return unreachable;
    }
  }
}
