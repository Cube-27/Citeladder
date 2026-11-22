import type { ReactNode } from 'react';

import type { ProbePage } from '@citeladder/contracts/probes';

import { Absence } from '@/components/ui/absence';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useShownSpan } from '@/components/ui/data-table-fit';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableCellLines, TableRow, UrlText } from '@/components/ui/table';
import { ChevronDown, ChevronRight } from '@/lib/icons';
import { classificationBadgeValue, classificationLabel } from '@/lib/runs/status';
import { standingLabel } from '@/lib/visibility/source-pages';
import { typeLabel } from '@/lib/visibility/sources';

export function ExpandToggle({
  open,
  onToggle,
  children,
}: Readonly<{ open: boolean; onToggle: () => void; children: ReactNode }>) {
  return (
    <Pressable aria-expanded={open} onClick={onToggle} className="w-auto">
      <Inline as="span">
        <Icon icon={open ? ChevronDown : ChevronRight} className="text-ink-2" />
        {children}
      </Inline>
    </Pressable>
  );
}

const PAGE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'page', label: 'Page' },
  { key: 'page-type', label: 'Page type', width: 'category' },
  { key: 'type', label: 'Source type', width: 'category' },
  { key: 'mentions', label: 'Mentions you', width: 'category' },
  { key: 'citations', label: 'Citations', kind: 'number', width: 'shortMetric' },
];

export function SourcePagesRow({
  label,
  pages,
  columns,
}: Readonly<{ label: string; pages: readonly ProbePage[]; columns: readonly DataTableColumn[] }>) {
  const span = useShownSpan(columns.map((column) => column.key));
  return (
    <TableRow>
      <TableCell nested colSpan={span}>
        <DataTable
          label={label}
          columns={PAGE_COLUMNS}
          state={
            pages.length ? undefined : { kind: 'empty', inline: true, message: 'No pages cited.' }
          }
        >
          {pages.map((page) => (
            <TableRow key={page.url}>
              <TableCell>
                <TableCellLines
                  primary={page.title || page.domain}
                  secondary={<UrlText url={page.url} />}
                  secondaryTooltip={page.url}
                />
              </TableCell>
              <TableCell>
                {typeLabel(page.page_format, 'url') ?? <Absence state="not_measured" />}
              </TableCell>
              <TableCell>
                <StatusMark
                  variant="classification"
                  value={classificationBadgeValue(page.classification)}
                >
                  {classificationLabel(page.classification)}
                </StatusMark>
              </TableCell>
              <TableCell>{standingLabel(page.standing)}</TableCell>
              <TableCell numeric>{page.citations}</TableCell>
            </TableRow>
          ))}
        </DataTable>
      </TableCell>
    </TableRow>
  );
}
