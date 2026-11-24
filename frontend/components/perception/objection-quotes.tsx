import type { ProbeObjectionsValue } from '@citeladder/contracts/probes';

import { EngineCell } from '@/components/perception/attribute-table';
import { AnswerLink } from '@/components/runs/answer-link';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useShownSpan } from '@/components/ui/data-table-fit';
import { TableCell, TableRow } from '@/components/ui/table';

type Quote = ProbeObjectionsValue['groups'][number]['quotes'][number];

const QUOTE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'said', label: 'What the AI said' },
  { key: 'engine', label: 'Engine', width: 'category' },
];

export function ObjectionQuotesRow({
  label,
  quotes,
  columns,
}: Readonly<{ label: string; quotes: readonly Quote[]; columns: readonly DataTableColumn[] }>) {
  const span = useShownSpan(columns.map((column) => column.key));
  if (!quotes.length) return null;
  return (
    <TableRow>
      <TableCell nested colSpan={span}>
        <DataTable label={label} columns={QUOTE_COLUMNS}>
          {quotes.map((quote, index) => (
            <TableRow key={`${quote.execution_id}:${index}`}>
              <TableCell className="whitespace-normal">
                <AnswerLink answer={quote} text="inherit">
                  “{quote.text}”
                </AnswerLink>
              </TableCell>
              <TableCell>
                <EngineCell engine={quote.logical_engine} />
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </TableCell>
    </TableRow>
  );
}
