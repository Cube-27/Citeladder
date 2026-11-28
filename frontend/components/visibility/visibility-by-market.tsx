import type { UseQueryResult } from '@tanstack/react-query';

import type { VisibilityMarkets } from '@citeladder/contracts/visibility';

import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Delta } from '@/components/ui/delta';
import { TableCell, TableRow } from '@/components/ui/table';
import { Absence } from '@/components/ui/absence';
import { formatRate } from '@/lib/visibility/dashboard';
import { SentimentValue } from '@/components/visibility/sentiment-value';
import { SHARE_OF_VOICE_HINT } from '@/lib/config/visibility';
import { queryTableState } from '@/components/ui/state-block';
import type { ProjectMarkets } from '@/lib/project/use-project-markets';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'market', label: 'Market' },
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

function marketsState(query: UseQueryResult<VisibilityMarkets>, markets: ProjectMarkets) {
  const subject = { subject: 'the markets' };
  if (markets.kind === 'failed')
    return queryTableState({ ...markets.read, isError: true, data: undefined }, subject);
  if (markets.kind === 'pending')
    return queryTableState({ ...query, isError: false, data: undefined }, subject);
  return queryTableState(query, subject);
}

export function VisibilityByMarket({
  query,
  markets,
  market,
  onSelectMarket,
}: Readonly<{
  query: UseQueryResult<VisibilityMarkets>;
  markets: ProjectMarkets;
  market: string | null;
  onSelectMarket: (market: string | null) => void;
}>) {
  if (markets.kind === 'loaded' && markets.markets.length < 2) return null;
  return (
    <DataTable title="By market" columns={COLUMNS} {...marketsState(query, markets)}>
      {(query.data?.markets ?? []).map((row) => (
        <TableRow key={row.market.id ?? 'default'}>
          <TableCell>
            <TextLink asChild text="inherit" underline="hover">
              <Pressable
                box="auto"
                aria-current={row.market.id === market ? 'true' : undefined}
                onClick={() => onSelectMarket(row.market.id)}
              >
                {row.market.label}
              </Pressable>
            </TextLink>
          </TableCell>
          {row.state === 'measured' ? (
            <>
              <TableCell numeric>{formatRate(row.mention_rate)}</TableCell>
              <TableCell numeric>
                <Delta
                  value={row.mention_rate_delta}
                  unit=" pp"
                  missingReason="No comparable earlier run"
                />
              </TableCell>
              <TableCell numeric>{formatRate(row.share_of_voice)}</TableCell>
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
  );
}
