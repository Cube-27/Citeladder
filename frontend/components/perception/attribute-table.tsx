import { Fragment, useState } from 'react';
import type {
  PerceptionQuote,
  PerceptionResponse,
} from '@citeladder/contracts/visibility-perception';

import { ExpandToggle } from '@/components/perception/probe-sources';
import { AnswerLink } from '@/components/runs/answer-link';
import { Absence } from '@/components/ui/absence';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { useShownSpan } from '@/components/ui/data-table-fit';
import { EngineCell } from '@/components/ui/engine-mark';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/typography';
import { Inline } from '@/components/ui/layout';
import { PolaritySplit } from '@/components/ui/polarity-bars';
import { QuoteGrid, QuoteGridRow } from '@/components/ui/quote-grid';
import { formatCount } from '@/lib/format';
import { optionalStringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import {
  categoryShare,
  filterCategories,
  SMALL_SAMPLE,
  sortCategories,
  type BreakdownNarrowing,
  type CategorySort,
} from '@/lib/visibility/perception';

type Category = PerceptionResponse['entities'][number]['categories'][number];

export function AttributeTable({
  categories,
  narrowing,
  empty,
}: Readonly<{
  categories: readonly Category[];
  narrowing: BreakdownNarrowing;
  empty: DataTableState | undefined;
}>) {
  const [sort, setSort] = useState<CategorySort | null>(null);
  const [open, setOpen] = useUrlState('attribute', optionalStringUrlCodec, { history: 'replace' });
  const shown = filterCategories(categories, narrowing);
  const rows = sort ? sortCategories(shown, sort) : shown;
  const sortable = (key: CategorySort['key']) => ({
    active: sort?.key === key,
    descending: sort?.key === key ? sort.descending : key !== 'attribute',
    onSort: () =>
      setSort({
        key,
        descending: sort?.key === key ? !sort.descending : key !== 'attribute',
      }),
  });
  const columns: readonly DataTableColumn[] = [
    { key: 'attribute', label: 'Attribute', sort: sortable('attribute') },
    { key: 'negative', label: 'Negative', kind: 'number', sort: sortable('negative') },
    { key: 'positive', label: 'Positive', kind: 'number', sort: sortable('positive') },
    { key: 'share', label: 'Share negative', kind: 'number', width: 'metric' },
    {
      key: 'split',
      label: 'Negative vs positive',
      width: 'category',
      priority: 'low',
      sort: sortable('share'),
    },
  ];
  return (
    <DataTable label="Attributes" columns={columns} state={rows.length ? undefined : empty}>
      {rows.map((category) => (
        <CategoryRow
          key={category.category}
          category={category}
          open={open === category.category}
          onToggle={() => setOpen(open === category.category ? null : category.category)}
        />
      ))}
    </DataTable>
  );
}

function CategoryRow({
  category,
  open,
  onToggle,
}: Readonly<{ category: Category; open: boolean; onToggle: () => void }>) {
  const share = categoryShare(category);
  const quotes = category.attributes.flatMap((attribute) =>
    attribute.quotes.map((quote) => ({ attribute: attribute.attribute, quote })),
  );
  return (
    <Fragment>
      <TableRow>
        <TableCell>
          {quotes.length ? (
            <ExpandToggle open={open} onToggle={onToggle}>
              {category.category}
            </ExpandToggle>
          ) : (
            <Text variant="body" box="indent">
              {category.category}
            </Text>
          )}
        </TableCell>
        <TableCell numeric>{formatCount(category.negative)}</TableCell>
        <TableCell numeric>{formatCount(category.positive)}</TableCell>
        <TableCell numeric>
          {share.kind === 'empty' ? (
            <Absence />
          ) : (
            <Inline as="span" inline>
              {share.small ? <Tag>{SMALL_SAMPLE}</Tag> : null}
              {share.text}
            </Inline>
          )}
        </TableCell>
        <TableCell>
          <PolaritySplit negative={category.negative} positive={category.positive} />
        </TableCell>
      </TableRow>
      {open && quotes.length ? <QuoteRows label={category.category} quotes={quotes} /> : null}
    </Fragment>
  );
}

const QUOTE_HEADS = ['Attribute', 'In the answer', 'Sentiment', 'Engine', 'Prompt'];

function QuoteRows({
  label,
  quotes,
}: Readonly<{ label: string; quotes: readonly { attribute: string; quote: PerceptionQuote }[] }>) {
  const span = useShownSpan(['attribute', 'negative', 'positive', 'share', 'split']);
  return (
    <TableRow>
      <TableCell nested colSpan={span} tight>
        <QuoteGrid heads={QUOTE_HEADS} label={`${label} quotes`}>
          {quotes.map(({ attribute, quote }) => (
            <QuoteGridRow key={`${quote.execution_id}:${quote.text}`}>
              <span>{attribute}</span>
              <span className="text-pretty">
                <AnswerLink answer={quote} attributes>
                  “{quote.text}”
                </AnswerLink>
              </span>
              <span>
                <StatusMark variant="sentiment" value={quote.polarity}>
                  {quote.polarity === 'negative' ? 'Negative' : 'Positive'}
                </StatusMark>
              </span>
              <EngineCell engine={quote.logical_engine} />
              <span>
                <AnswerLink answer={quote} attributes text="inherit" tone="muted" underline="hover">
                  {quote.prompt}
                </AnswerLink>
              </span>
            </QuoteGridRow>
          ))}
        </QuoteGrid>
      </TableCell>
    </TableRow>
  );
}
