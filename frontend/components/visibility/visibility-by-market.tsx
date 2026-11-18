import type { UseQueryResult } from '@tanstack/react-query';

import type { ProjectMarket } from '@citeladder/contracts/markets';
import type { VisibilityMarkets } from '@citeladder/contracts/visibility';

import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { TitledSection } from '@/components/ui/section';
import { Delta } from '@/components/ui/delta';
import { TableCell, TableRow } from '@/components/ui/table';
import { Absence } from '@/components/ui/absence';
import { formatRate, measured } from '@/lib/visibility/dashboard';
import { SentimentValue } from '@/components/visibility/sentiment-value';
import { SHARE_OF_VOICE_HINT } from '@/lib/config/visibility';
import { readErrorProps } from '@/components/ui/notice';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'market', label: 'Market' },
  // The metric names the KPI row uses: `mention_rate` here is the Visibility rate.
  { key: 'mention', label: 'Visibility', width: 'figure', kind: 'number' },
  { key: 'mention-change', label: 'Change', width: 'figure', kind: 'number' },
  {
    key: 'voice',
    label: 'Share of voice',
    hint: SHARE_OF_VOICE_HINT,
    width: 'metric',
    kind: 'number',
  },
  { key: 'voice-change', label: 'Change', width: 'figure', kind: 'number' },
  { key: 'net', label: 'Net sentiment', width: 'figure', kind: 'number' },
];

function marketsState(query: UseQueryResult<VisibilityMarkets>): DataTableState | undefined {
  if (query.isError)
    return {
      kind: 'error',
      ...readErrorProps(query),
      title: "Couldn't load the markets",
      fallback: 'The request failed or timed out.',
    };
  if (query.isPending) return { kind: 'loading', label: 'Loading markets…' };
  return undefined;
}

/**
 * Each market's latest run side by side. Markets are measured apart and never
 * pooled; a market without a run reads "Not run", never zero.
 */
export function VisibilityByMarket({
  query,
  markets,
  market,
  onSelectMarket,
}: Readonly<{
  query: UseQueryResult<VisibilityMarkets>;
  markets: readonly ProjectMarket[];
  market: string | null;
  onSelectMarket: (market: string | null) => void;
}>) {
  if (markets.length < 2) return null;
  return (
    <TitledSection title="By market">
      <DataTable
        label="By market"
        columns={COLUMNS}
        footer="Each market's latest run, with the change since its previous comparable run."
        state={marketsState(query)}
      >
        {(query.data?.markets ?? []).map((row) => (
          <TableRow key={row.market.id ?? 'default'}>
            <TableCell>
              <TextLink asChild text="inherit" underline="hover">
                <Pressable
                  className="w-auto"
                  aria-current={row.market.id === market ? 'true' : undefined}
                  onClick={() => onSelectMarket(row.market.id)}
                >
                  {row.market.label}
                </Pressable>
              </TextLink>
            </TableCell>
            {row.state === 'measured' ? (
              <>
                <TableCell numeric>
                  {measured(formatRate(row.mention_rate)) ?? <Absence />}
                </TableCell>
                <TableCell numeric>
                  <Delta
                    value={row.mention_rate_delta}
                    unit=" pp"
                    missingReason="No comparable earlier run"
                  />
                </TableCell>
                <TableCell numeric>
                  {measured(formatRate(row.share_of_voice)) ?? <Absence />}
                </TableCell>
                <TableCell numeric>
                  <Delta
                    value={row.share_of_voice_delta}
                    unit=" pp"
                    missingReason="No comparable earlier run"
                  />
                </TableCell>
                <TableCell numeric>
                  <SentimentValue sentiment={row.sentiment} tooFew="Too few" showCount={false} />
                </TableCell>
              </>
            ) : (
              <TableCell numeric colSpan={5}>
                <Absence
                  state="not_run"
                  label={row.state === 'no_run' ? undefined : 'Being prepared'}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}
