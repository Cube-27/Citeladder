import { useAnswerDialog } from '@/components/runs/answer-link';
import { Absence } from '@/components/ui/absence';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EngineBrandMark } from '@/components/ui/engine-mark';
import { Inline } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { StatusMark, type StatusValue } from '@/components/ui/status-mark';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { Value } from '@/components/ui/value';
import { formatCount, formatMean } from '@/lib/format';
import { formatRate } from '@/lib/products/product-columns';
import type {
  ProductPromptOutcomes,
  ProductRun,
  PromptEngineCell,
} from '@/lib/products/prompt-outcomes';
import { useEngineCatalog } from '@/lib/providers/engines';

const OUTCOME_TONE: Record<ProductRun['outcome'], StatusValue> = {
  won: 'success',
  lost: 'danger',
  unranked: 'info',
};

const outcomeLabel = (run: ProductRun) => (run.rank === null ? 'Unranked' : `#${run.rank}`);

const mean = (value: number | null) => (
  <Value value={value === null ? null : formatMean(value)} absent="unavailable" />
);
const rate = (value: number | null) => (
  <Value value={value === null ? null : formatRate(value)} absent="unavailable" />
);

const sampleLabel = ({ shown, total }: ProductPromptOutcomes['runs']) =>
  shown < total ? `Newest ${formatCount(shown)} of ${formatCount(total)} runs` : undefined;

const ENGINE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'engine', label: 'Engine', kind: 'identity' },
  { key: 'named', label: 'Named in', kind: 'number', hint: 'Runs that named it.' },
  { key: 'won', label: 'Won', kind: 'number', hint: 'Runs that ranked it first.' },
  {
    key: 'lost',
    label: 'Lost',
    kind: 'number',
    priority: 'low',
    hint: 'Runs that ranked another product first.',
  },
  { key: 'win', label: 'Win rate', kind: 'number' },
  { key: 'position', label: 'Position', kind: 'number' },
];

export function EngineOutcomes({ outcomes }: Readonly<{ outcomes: ProductPromptOutcomes }>) {
  const engines = useEngineCatalog();
  return (
    <DataTable
      title="By engine"
      description={sampleLabel(outcomes.runs)}
      columns={ENGINE_COLUMNS}
      state={
        outcomes.engines.length
          ? undefined
          : { kind: 'empty', inline: true, message: 'No engine named it in this window.' }
      }
    >
      {outcomes.engines.map((row) => (
        <TableRow key={row.engine}>
          <TableCell>
            <Inline as="span" gap="item">
              <EngineBrandMark engine={row.engine} />
              {engines.label(row.engine)}
            </Inline>
          </TableCell>
          <TableCell numeric>{formatCount(row.named)}</TableCell>
          <TableCell numeric>{formatCount(row.won)}</TableCell>
          <TableCell numeric>{formatCount(row.lost)}</TableCell>
          <TableCell numeric>{rate(row.winRate)}</TableCell>
          <TableCell numeric>{mean(row.position)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const PROMPT_COLUMNS: readonly DataTableColumn[] = [
  { key: 'prompt', label: 'Prompt', kind: 'identity' },
  { key: 'visibility', label: 'Visibility', kind: 'number' },
  { key: 'appearances', label: 'Named in', kind: 'number', priority: 'low' },
  { key: 'win', label: 'Win rate', kind: 'number', priority: 'low' },
  { key: 'position', label: 'Position', kind: 'number' },
];

function EngineOutcome({
  cell,
  engine,
  prompt,
  onOpen,
}: Readonly<{
  cell: PromptEngineCell | undefined;
  engine: string;
  prompt: string;
  onOpen: (run: ProductRun) => void;
}>) {
  if (!cell) return <Absence state="none" label="Not named" />;
  const { latest } = cell;
  const tally = `won ${formatCount(cell.won)} of ${formatCount(cell.named)} runs`;
  return (
    <Pressable
      look="chip"
      title={`${engine}: ${tally}`}
      aria-label={`Open the latest ${engine} run for ${prompt}: ${outcomeLabel(latest)}, ${tally}`}
      onClick={() => onOpen(latest)}
    >
      <StatusMark variant="status" value={OUTCOME_TONE[latest.outcome]}>
        {outcomeLabel(latest)}
      </StatusMark>
    </Pressable>
  );
}

export function ProductPrompts({ outcomes }: Readonly<{ outcomes: ProductPromptOutcomes }>) {
  const engines = useEngineCatalog();
  const dialog = useAnswerDialog();
  const engineKeys = outcomes.engines.map((row) => row.engine);
  const columns: DataTableColumn[] = [
    ...PROMPT_COLUMNS,
    ...engineKeys.map((engine): DataTableColumn => ({
      key: `engine-${engine}`,
      label: engines.label(engine),
      kind: 'status',
      hint: 'Its rank in the latest run that named it.',
    })),
  ];
  return (
    <>
      <DataTable
        title="Prompts"
        description={sampleLabel(outcomes.runs)}
        columns={columns}
        state={
          outcomes.prompts.length
            ? undefined
            : { kind: 'empty', inline: true, message: 'No prompt named it in this window.' }
        }
      >
        {outcomes.prompts.map((row) => (
          <TableRow key={row.key}>
            <TableCell>
              <TableCellLines primary={row.text} />
            </TableCell>
            <TableCell numeric>{rate(row.metrics?.visibility ?? null)}</TableCell>
            <TableCell numeric>
              {row.metrics ? (
                `${formatCount(row.metrics.appearances)} of ${formatCount(row.metrics.executions)}`
              ) : (
                <Absence state="unavailable" />
              )}
            </TableCell>
            <TableCell numeric>{rate(row.metrics?.win_rate ?? null)}</TableCell>
            <TableCell numeric>{mean(row.metrics?.position ?? null)}</TableCell>
            {engineKeys.map((engine) => (
              <TableCell key={engine}>
                <EngineOutcome
                  cell={row.engines.get(engine)}
                  engine={engines.label(engine)}
                  prompt={row.text}
                  onOpen={(run) => dialog.open({ id: run.task_id, prompt_text: run.prompt_text })}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </DataTable>
      {dialog.dialog}
    </>
  );
}
