import { Bot } from 'lucide-react';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { Pressable } from '@/components/ui/pressable';
import type { Visibility } from '@citeladder/contracts';
import { useEngineCatalog } from '@/lib/providers/engines';
import { formatCount } from '@/lib/format';
import {
  formatRate,
  measured,
  visibleEngines,
  type VisibilityFilters,
} from '@/lib/visibility/dashboard';
import { Absence } from '@/components/ui/absence';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'model', label: 'Model' },
  { key: 'visibility', label: 'Visibility', width: 'figure', numeric: true },
  { key: 'owned', label: 'Owned citation rate', width: 'status', numeric: true },
  { key: 'answers', label: 'Answers', width: 'figure', numeric: true },
];

export function EngineComparison({
  visibility,
  filter,
  onSelect,
}: Readonly<{
  visibility: Visibility;
  filter: VisibilityFilters['engine'];
  onSelect?: (engine: string) => void;
}>) {
  const catalog = useEngineCatalog();
  const engines = visibleEngines(visibility, filter, catalog.order);
  return (
    <DataTable
      title="By model"
      columns={COLUMNS}
      footer="How each answer engine treated your brand."
      rowLines={2}
      minWidth="sm"
      state={
        engines.length
          ? undefined
          : { kind: 'empty', headingLevel: 3, icon: Bot, heading: 'No model observations' }
      }
    >
      {engines.map((engine) => (
        <TableRow key={engine.logical_engine}>
          <TableCell>
            {/* The engine by its name over the model it pinned; an observed
                surface (a consumer app, a results page) pinned none, so its
                route id is never shown. */}
            <TableCellLines
              title
              primary={
                onSelect ? (
                  <Pressable
                    className="inline-flex min-h-6 w-auto items-center underline-offset-3 hover:underline"
                    onClick={() => onSelect(engine.logical_engine)}
                  >
                    {catalog.label(engine.logical_engine)}
                  </Pressable>
                ) : (
                  catalog.label(engine.logical_engine)
                )
              }
              secondary={modelsOf(visibility, engine.logical_engine, catalog) || undefined}
            />
          </TableCell>
          <TableCell numeric>
            {measured(formatRate(engine.brand_mention_rate)) ?? <Absence />}
          </TableCell>
          <TableCell numeric>
            {measured(formatRate(engine.owned_citation_rate)) ?? <Absence />}
          </TableCell>
          {/* This read "N measured / M expected", or "expected count
              unavailable" — the run's own bookkeeping. How many answers
              a rate is drawn from is the reader's business; how many we
              hoped for is not. */}
          <TableCell numeric>{formatCount(engine.total_completed)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

/** The models an engine's answers pinned, by name; empty for an observed surface. */
function modelsOf(
  visibility: Visibility,
  engine: string,
  catalog: ReturnType<typeof useEngineCatalog>,
): string {
  return visibility.model_provenance
    .filter((item) => item.logical_engine === engine)
    .map((item) => catalog.modelLabel(engine, item.transport_model))
    .filter((model): model is string => model !== null)
    .join(', ');
}
