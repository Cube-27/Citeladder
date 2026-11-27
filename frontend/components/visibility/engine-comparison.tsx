import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { TitledSection } from '@/components/ui/section';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { EngineLabel } from '@/components/ui/engine-mark';
import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import type { Visibility } from '@citeladder/contracts';
import { Bot } from '@/lib/icons';
import { useEngineCatalog } from '@/lib/providers/engines';
import { formatCount } from '@/lib/format';
import { formatRate, visibleEngines, type VisibilityFilters } from '@/lib/visibility/dashboard';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'engine', label: 'Engine' },
  { key: 'visibility', label: 'Visibility', width: 'figure', kind: 'number' },
  { key: 'owned', label: 'Owned citation rate', width: 'status', kind: 'number' },
  { key: 'answers', label: 'Prompt runs', width: 'figure', kind: 'number' },
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
    <TitledSection title="By engine">
      <DataTable
        label="By engine"
        columns={COLUMNS}
        state={
          engines.length
            ? undefined
            : { kind: 'empty', headingLevel: 3, icon: Bot, heading: 'No engine observations' }
        }
      >
        {engines.map((engine) => (
          <TableRow key={engine.logical_engine}>
            <TableCell>
              <TableCellLines
                title
                primary={
                  onSelect ? (
                    <TextLink asChild text="inherit" underline="hover">
                      <Pressable box="target" onClick={() => onSelect(engine.logical_engine)}>
                        <EngineLabel engine={engine.logical_engine} />
                      </Pressable>
                    </TextLink>
                  ) : (
                    <EngineLabel engine={engine.logical_engine} />
                  )
                }
              />
            </TableCell>
            <TableCell numeric>{formatRate(engine.brand_mention_rate)}</TableCell>
            <TableCell numeric>{formatRate(engine.owned_citation_rate)}</TableCell>
            <TableCell numeric>{formatCount(engine.total_completed)}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}
